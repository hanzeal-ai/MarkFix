import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { app, BrowserWindow, desktopCapturer, safeStorage, shell, webContents } from 'electron';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
const root = resolve(import.meta.dirname, '../../..');
const profile = mkdtempSync(join(tmpdir(), 'markfix-native-'));
const output = process.env.MARKFIX_SMOKE_OUTPUT_DIR || join(profile, 'screenshots');
mkdirSync(output, { recursive: true });
app.setPath('userData', profile);
// Test credentials only, isolated profile; operating-system vault is outside this UI smoke.
safeStorage.isEncryptionAvailable = () => true;
safeStorage.encryptString = (v) => Buffer.from(v);
safeStorage.decryptString = (v) => v.toString();
const chromeLaunches = [];
childProcess.execFile = (file, args, callback) => {
  chromeLaunches.push({ file, args });
  callback(null, '', '');
};
syncBuiltinESMExports();
const links = [];
shell.openExternal = async (url) => {
  links.push(url);
};
const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url.startsWith('/v1/client-policy'))
    res.end(
      JSON.stringify({
        status: 'supported',
        minimumVersion: '0.1.0',
        recommendedVersion: '0.1.0',
        currentVersion: '0.1.0',
        features: {},
      }),
    );
  else if (req.url === '/v1/auth/login')
    res.end(JSON.stringify({ accessToken: 'test', refreshToken: 'test', expiresIn: 3600 }));
  else if (req.url === '/v1/me')
    res.end(
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'fixture@example.test',
        displayName: '界面验收',
      }),
    );
  else if (req.url === '/v1/workspaces') res.end('[]');
  else if (req.url === '/slow-image') {
    setTimeout(() => res.end(''), 5000);
  } else if (req.url.startsWith('/site')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      '<!doctype html><title>界面验收项目</title><style>body{margin:0;width:2400px;height:2000px}html::-webkit-scrollbar{height:14px;width:12px}</style><h1 style="margin-left:480px;color:#6558e8">Test fixture</h1>',
    );
  } else {
    res.statusCode = 404;
    res.end('{}');
  }
});
const timeout = setTimeout(() => {
  console.error('Smoke timeout');
  process.exit(1);
}, 30000);
let handled = false;
app.on('browser-window-created', (_event, win) => {
  if (handled) return;
  handled = true;
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setAlwaysOnTop(true);
      win.show();
      win.focus();
      assert.equal(
        win.getContentBounds().y,
        win.getBounds().y,
        'Main window uses an integrated header',
      );
      assert.equal(win.getTitle(), '', 'Main title stays empty after page load');
      const clickHeaderButton = async (index = 0) => {
        const point = await win.webContents.executeJavaScript(
          `(()=>{const b=document.querySelectorAll('.header-navigation-controls button')[${index}].getBoundingClientRect();return {x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`,
        );
        win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
        win.webContents.sendInputEvent({
          type: 'mouseDown',
          button: 'left',
          clickCount: 1,
          ...point,
        });
        win.webContents.sendInputEvent({
          type: 'mouseUp',
          button: 'left',
          clickCount: 1,
          ...point,
        });
      };
      const run = (code) =>
        win.webContents.executeJavaScript(code).catch((error) => {
          console.error('Failed step:', code);
          throw error;
        });
      await run(
        `window.qa={wait:async(fn)=>{const end=Date.now()+8000;while(!fn()){if(Date.now()>end)throw Error('UI condition timed out: '+fn);await new Promise(r=>setTimeout(r,50));}},button:(name)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name),fill:(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));}};qa.wait(()=>document.querySelector('h1')?.textContent==='登录 MarkFix')`,
      );
      writeFileSync(
        join(output, 'desktop-login.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      for (const [label, path] of [
        ['立即注册', 'register'],
        ['忘记密码', 'forgot-password'],
        ['隐私政策', 'privacy'],
        ['服务条款', 'terms'],
      ]) {
        await run(`qa.button(${JSON.stringify(label)}).click()`);
        await new Promise((r) => setTimeout(r, 80));
        assert.equal(links.at(-1), `http://localhost:4311/${path}`);
      }
      await run(
        `document.querySelectorAll('[data-close-button]').forEach(button=>button.click());qa.wait(()=>!document.querySelector('[data-sonner-toast]'))`,
      );
      await run(`document.querySelector('[aria-label="显示密码"]').click();`);
      assert.equal(
        await run(`document.querySelector('[data-slot="password-field"] input').type`),
        'text',
      );
      assert.equal(
        await run(
          `(()=>{const a=document.querySelector('[data-slot="password-field"] input').getBoundingClientRect(),b=document.querySelector('.password-visibility-toggle').getBoundingClientRect();return Math.abs(a.y+a.height/2-b.y-b.height/2)})()`,
        ),
        0,
      );
      await run(
        `qa.fill(document.querySelector('input[type="email"]'),'fixture@example.test');qa.fill(document.querySelector('[data-slot="password-field"] input'),'fixture-password');`,
      );
      await run(
        `qa.button('登录').click();qa.wait(()=>document.querySelector('[aria-label="新标注"]'))`,
      );
      console.log('PASS desktop login and account page links');
      if (process.env.MARKFIX_HEADER_SMOKE) {
        for (let repeat = 0; repeat < 4; repeat++) {
          await clickHeaderButton();
          await run(`qa.wait(()=>document.querySelector('.shell.sidebar-collapsed'))`);
          assert.equal(
            await run(
              `document.querySelector('.navigation-header').getBoundingClientRect().left >= document.querySelector('.window-controls').getBoundingClientRect().right`,
            ),
            true,
          );
          await clickHeaderButton(1);
          await run(`qa.wait(()=>document.activeElement?.id==='new-project-url')`);
          await clickHeaderButton();
          await run(`qa.wait(()=>document.querySelector('.shell.sidebar-expanded'))`);
        }
        console.log('PASS repeated sidebar toggles and new annotation address focus');
        clearTimeout(timeout);
        process.exit(0);
        return;
      }

      await run(
        `document.querySelector('[aria-label="帮助"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menuitem"]')?.textContent.includes('新功能'))`,
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      writeFileSync(
        join(output, 'account-help.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(`document.querySelector('[role="menuitem"]').click()`);
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.deepEqual(chromeLaunches.at(-1), {
        file: '/usr/bin/open',
        args: ['-a', 'Google Chrome', 'https://markfix.hanzeal.com'],
      });
      console.log('PASS help menu and Chrome website launch command');

      await run(
        `document.querySelector('input[value="LOCAL"]').click();qa.fill(document.querySelector('#new-project-url'),'javascript:alert(1)')`,
      );
      await run(
        `document.querySelector('#new-project-url').form.requestSubmit();qa.wait(()=>document.body.textContent.includes('请输入有效的 HTTPS 网站地址'))`,
      );
      assert.equal(await run(`!!document.querySelector('#new-project-error')`), false);
      await run(
        `qa.wait(()=>{const toast=[...document.querySelectorAll('[data-sonner-toast]')].find(e=>e.textContent.includes('请输入有效'));return toast && getComputedStyle(toast).opacity==='1' && toast.getBoundingClientRect().top>50;})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      writeFileSync(
        join(output, 'project-error-message.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(
        `document.querySelectorAll('[data-close-button]').forEach(button=>button.click());qa.wait(()=>!document.querySelector('[data-sonner-toast]'))`,
      );
      await run(
        `qa.fill(document.querySelector('#new-project-url'),${JSON.stringify(process.env.MARKFIX_API_URL + '/site')})`,
      );
      await run(
        `document.querySelector('#new-project-url').form.requestSubmit();qa.wait(()=>document.querySelector('[aria-label="删除项目：界面验收项目"]'))`,
      );
      await run(`qa.wait(()=>!document.querySelector('.browser-bar .spin'))`);
      await webContents
        .getAllWebContents()
        .find((c) => c.getURL().includes('/site'))
        .executeJavaScript(
          "const frame=document.createElement('iframe');frame.src='/slow-image';document.body.append(frame);document.title='界面验收项目';",
        );
      assert.equal(await run(`!!document.querySelector('.browser-bar .spin')`), false);
      console.log('PASS refresh stops after DOM readiness despite slow subresources');
      assert.equal(
        await run(
          `(async()=>{const {websiteProjects}=await window.markfix.desktopBootstrap();let state;const stop=window.markfix.onBrowserState(value=>{state=value;});await window.markfix.switchWebsiteProject(websiteProjects[0].id);await qa.wait(()=>state!==undefined);stop();return state.loading;})()`,
        ),
        false,
      );
      console.log('PASS reopening ready project republishes idle browser state');

      assert.equal(
        await run(`document.querySelector('.save-annotations-button').textContent.trim()`),
        '',
      );
      assert.equal(
        await run(
          `document.querySelector('.save-annotations-button').querySelectorAll('svg').length`,
        ),
        1,
      );
      assert.equal(
        await run(`document.querySelector('.save-annotations-button').getAttribute('aria-label')`),
        '提交标注',
      );
      assert.equal(await run(`document.querySelector('.save-annotations-button').disabled`), true);
      assert.equal(await run(`document.querySelectorAll('.project-sidebar-item > i').length`), 0);
      for (const expanded of [true, false]) {
        if (!expanded) await run(`document.querySelector('[aria-label="收起项目侧边栏"]').click()`);
        win.setSize(1060, 680);
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(
          await run(
            `(()=>{const bar=document.querySelector('.browser-bar').getBoundingClientRect(), address=document.querySelector('.prototype-browser-bar').getBoundingClientRect(), controls=document.querySelector('.window-controls').getBoundingClientRect(), tools=document.querySelector('.tools').getBoundingClientRect();return bar.left>=controls.right && getComputedStyle(document.querySelector('.window-controls')).webkitAppRegion==='no-drag' && bar.height===56 && address.height===document.querySelector('.annotation-mode-control').getBoundingClientRect().height && address.top>=0 && address.bottom<=56 && address.left>=controls.right && address.right<=tools.left})()`,
          ),
          true,
        );
      }
      await clickHeaderButton();
      await run(`qa.wait(()=>document.querySelector('[aria-label="收起项目侧边栏"]'))`);
      await new Promise((resolve) => setTimeout(resolve, 350));
      win.setSize(1440, 900);
      assert.equal(
        await run(
          `document.querySelector('.header-navigation-controls [aria-label="新标注"]')===null`,
        ),
        true,
      );
      await run(
        `document.querySelector('[aria-label="收起项目侧边栏"]').click();qa.wait(()=>document.querySelector('.header-navigation-controls [aria-label="新标注"]'))`,
      );
      const viewportWidthBefore = await webContents
        .getAllWebContents()
        .find((c) => c.getURL().includes('/site'))
        .executeJavaScript('innerWidth');
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 600, y: 28 });
      await new Promise((resolve) => setTimeout(resolve, 250));
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 114, y: 28 });
      await run(`qa.wait(()=>document.querySelector('.sidebar-peeking .project-sidebar'))`);
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(
        await webContents
          .getAllWebContents()
          .find((c) => c.getURL().includes('/site'))
          .executeJavaScript('innerWidth'),
        viewportWidthBefore,
      );
      await run(`qa.wait(()=>document.querySelector('body > img')?.complete)`);
      assert.equal(
        await run(`document.querySelector('.project-sidebar').getBoundingClientRect().top`),
        56,
      );
      assert.equal(win.contentView.children[0].getVisible(), false);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 110, y: 200 });
      await new Promise((resolve) => setTimeout(resolve, 250));
      assert.equal(await run(`!!document.querySelector('.sidebar-peeking')`), true);
      writeFileSync(
        join(output, 'sidebar-hover-shell.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await new Promise((resolve) => setTimeout(resolve, 600));
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1440, height: 900 },
      });
      const source = sources.find((source) => source.id === win.getMediaSourceId());
      if (source) writeFileSync(join(output, 'sidebar-hover-native.png'), source.thumbnail.toPNG());
      win.webContents.sendInputEvent({ type: 'mouseMove', x: 600, y: 28 });
      await run(
        `qa.wait(()=>!document.querySelector('.project-sidebar') && !document.querySelector('body > img'))`,
      );
      assert.equal(win.contentView.children[0].getVisible(), true);
      assert.equal(await run(`!!document.querySelector('.project-loading-page')`), false);
      await clickHeaderButton();
      await run(`qa.wait(()=>document.querySelector('[aria-label="收起项目侧边栏"]'))`);
      await new Promise((resolve) => setTimeout(resolve, 350));
      console.log('PASS collapsed new icon, sidebar hover and stable website width');
      const dragSidebar = async (from, to) => {
        win.webContents.sendInputEvent({
          type: 'mouseDown',
          x: from,
          y: 220,
          button: 'left',
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        win.webContents.sendInputEvent({
          type: 'mouseMove',
          x: to,
          y: 220,
          modifiers: ['leftButtonDown'],
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const edge = await run(
          `document.querySelector('.project-sidebar')?.getBoundingClientRect().right ?? 0`,
        );
        assert.equal(win.contentView.children[0].getBounds().x, edge);
        win.webContents.sendInputEvent({
          type: 'mouseUp',
          x: to,
          y: 220,
          button: 'left',
          clickCount: 1,
        });
      };
      await dragSidebar(197, 320);
      await run(
        `qa.wait(()=>document.querySelector('.project-sidebar').getBoundingClientRect().width===320)`,
      );
      await dragSidebar(317, 100);
      await run(`qa.wait(()=>!document.querySelector('.project-sidebar'))`);
      await clickHeaderButton();
      await run(
        `qa.wait(()=>document.querySelector('.project-sidebar')?.getBoundingClientRect().width===320)`,
      );
      await dragSidebar(317, 200);
      await run(
        `qa.wait(()=>document.querySelector('.project-sidebar').getBoundingClientRect().width===200)`,
      );
      console.log('PASS sidebar drag, collapse and remembered width');
      await clickHeaderButton();
      await run(
        `qa.wait(()=>document.querySelector('.header-navigation-controls [aria-label="新标注"]'))`,
      );
      await clickHeaderButton(1);
      await run(`qa.wait(()=>document.querySelector('#new-project-url'))`);
      await clickHeaderButton();
      await run(`qa.wait(()=>document.querySelector('.project-sidebar-item'))`);
      await run(
        `document.querySelector('.project-sidebar-item').click();qa.wait(()=>document.querySelector('.browser-bar'))`,
      );
      for (let repeat = 0; repeat < 3; repeat++) {
        await clickHeaderButton();
        await run(`qa.wait(()=>document.querySelector('.shell.sidebar-collapsed'))`);
        await clickHeaderButton(1);
        await run(`qa.wait(()=>document.querySelector('#new-project-url'))`);
        await clickHeaderButton();
        await run(`qa.wait(()=>document.querySelector('.shell.sidebar-expanded'))`);
        await run(
          `document.querySelector('.project-sidebar-item').click();qa.wait(()=>document.querySelector('.browser-bar'))`,
        );
      }
      console.log('PASS mouse click opens sidebar and new annotation');

      for (const fullscreen of [true, false]) {
        const changed = new Promise((resolve) =>
          win.once(fullscreen ? 'enter-full-screen' : 'leave-full-screen', resolve),
        );
        win.setFullScreen(fullscreen);
        await changed;
        await run(
          `qa.wait(()=>document.documentElement.classList.contains('window-fullscreen')===${fullscreen})`,
        );
        assert.equal(
          await run(`getComputedStyle(document.querySelector('.window-controls')).paddingLeft`),
          fullscreen ? '12px' : '100px',
        );
      }
      const target = webContents
        .getAllWebContents()
        .find((contents) => contents.getURL() === process.env.MARKFIX_API_URL + '/site');
      assert.ok(target);
      for (const path of ['/site', '/site?reload=1']) {
        if (path !== '/site') await target.loadURL(process.env.MARKFIX_API_URL + path);
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          await target.executeJavaScript('innerHeight - document.documentElement.clientHeight'),
          0,
        );
        assert.equal(
          await target.executeJavaScript('scrollTo(100,100); scrollX === 100 && scrollY === 100'),
          true,
        );
        await target.executeJavaScript('scrollTo(0,0)');
      }
      assert.equal(
        await run(
          `[...document.querySelectorAll('.project-sidebar-action, .project-sidebar-item')].every(e=>{const s=getComputedStyle(e);return s.borderRadius==='0px' && s.boxShadow==='none' && s.borderTopWidth==='0px'})`,
        ),
        true,
      );
      writeFileSync(
        join(output, 'sidebar-toolbar.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(
        `document.querySelectorAll('[data-close-button]').forEach(button=>button.click());qa.wait(()=>!document.querySelector('[data-sonner-toast]'))`,
      );
      const projectId = await run(
        `window.markfix.listWebsiteProjects().then(items=>items.find(p=>p.title==='界面验收项目')?.id || items[0].id)`,
      );
      const captureId = '22222222-2222-4222-8222-222222222222';
      const dataUrl = (await win.webContents.capturePage()).toDataURL();
      const pageUrl = process.env.MARKFIX_API_URL + '/site';
      await run(
        `window.markfix.saveCaptureRecord(${JSON.stringify({
          id: captureId,
          projectId,
          pageSessionId: '33333333-3333-4333-8333-333333333333',
          pageTitle: '界面验收项目',
          status: 'draft',
          pageUrl,
          note: '标题栏验收截图',
          dataUrl,
          sourceDataUrl: dataUrl,
          widthCssPx: 100,
          heightCssPx: 100,
          marks: [],
          captureScale: 1,
          selection: {
            kind: 'region',
            xCssPx: 0,
            yCssPx: 0,
            widthCssPx: 100,
            heightCssPx: 100,
            documentUrl: pageUrl,
            scrollXCssPx: 0,
            scrollYCssPx: 0,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })})`,
      );
      for (const [name, method, args] of [
        ['settings', 'openSettings', []],
        ['review', 'openAnnotationReview', [projectId]],
        ['history', 'openAnnotationHistory', []],
        ['project-history', 'openProjectAnnotationHistory', [projectId]],
        ['capture-preview', 'openCapturePreview', [projectId, captureId]],
      ]) {
        await run(`window.markfix.${method}(...${JSON.stringify(args)})`);
        const child = BrowserWindow.getAllWindows().find((candidate) => candidate !== win);
        assert.ok(child, name);
        assert.ok(child.getContentBounds().y > child.getBounds().y, name + ' native title bar');
        await child.webContents.executeJavaScript(`(async()=>{
          const end=Date.now()+8000;
          while(document.querySelector('.loading') || !document.querySelector('#root')?.textContent){
            if(Date.now()>end)throw Error('Child renderer did not finish loading');
            await new Promise(resolve=>setTimeout(resolve,50));
          }
        })()`);
        writeFileSync(join(output, name + '.png'), (await child.webContents.capturePage()).toPNG());
        child.close();
      }
      console.log('PASS integrated main header and native child title bars');
      if (await run(`!!document.querySelector('[aria-label="展开项目侧边栏"]')`))
        await clickHeaderButton();
      await run(`qa.wait(()=>document.querySelector('[aria-label="删除项目：界面验收项目"]'))`);
      await run(
        `document.querySelector('[aria-label="删除项目：界面验收项目"]').click();qa.wait(()=>document.querySelector('[role="alertdialog"]'))`,
      );
      await run(`qa.wait(()=>document.activeElement?.textContent==='取消')`);
      assert.equal(
        await run(`getComputedStyle(qa.button('删除项目')).backgroundColor`),
        'rgb(180, 35, 24)',
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      writeFileSync(
        join(output, 'delete-project.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await run(
        `qa.button('取消').click();qa.wait(()=>!document.querySelector('[role="alertdialog"]'))`,
      );
      assert.equal(
        await run(`!!document.querySelector('[aria-label="删除项目：界面验收项目"]')`),
        true,
      );
      await run(
        `document.querySelector('[aria-label="删除项目：界面验收项目"]').click();qa.wait(()=>document.querySelector('[role="alertdialog"]'))`,
      );
      await run(
        `qa.button('删除项目').click();qa.wait(()=>!document.querySelector('[aria-label="删除项目：界面验收项目"]'))`,
      );
      console.log(
        'PASS error message, red confirmation, cancel, and disposable local project deletion',
      );
      console.log('Screenshots: ' + output);
      clearTimeout(timeout);
      server.close();
      process.exit(0);
    } catch (e) {
      console.error(e);
      console.log(
        await win.webContents.executeJavaScript(
          `JSON.stringify({width:document.querySelector('.project-sidebar')?.getBoundingClientRect().width,saved:localStorage.getItem('markfix:sidebar-width'),expanded:localStorage.getItem('markfix:sidebar-expanded')})`,
        ),
      );
      writeFileSync(
        join(output, 'smoke-failure.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      clearTimeout(timeout);
      server.close();
      process.exit(1);
    }
  });
});
server.listen(0, '127.0.0.1', () => {
  process.env.MARKFIX_API_URL = `http://127.0.0.1:${server.address().port}`;
  process.env.MARKFIX_ALLOW_HTTP = 'true';
  process.env.MARKFIX_DASHBOARD_ORIGIN = 'http://localhost:4311';
  import(join(root, 'apps/desktop/out/main/index.js')).catch((e) => {
    console.error(e);
    process.exit(1);
  });
});
