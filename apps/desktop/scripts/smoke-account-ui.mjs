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
const links = [];
let passwordChanges = 0;
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
    setTimeout(
      () => res.end(JSON.stringify({ accessToken: 'test', refreshToken: 'test', expiresIn: 3600 })),
      250,
    );
  else if (req.url === '/v1/auth/register')
    res.end(
      JSON.stringify({
        user: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'registered@example.test',
          displayName: '新账户',
          emailVerified: false,
        },
        verificationRequired: true,
      }),
    );
  else if (req.url === '/v1/me/password' && req.method === 'PATCH') {
    passwordChanges += 1;
    res.end(JSON.stringify({ changed: true }));
  } else if (req.url === '/v1/me')
    res.end(
      JSON.stringify({
        id: '11111111-1111-4111-8111-111111111111',
        email: 'fixture@example.test',
        displayName: '界面验收',
      }),
    );
  else if (req.url === '/v1/projects') res.end('[]');
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
  return app.exit(1);
}, 60000);
let handled = false;
app.on('browser-window-created', (_event, win) => {
  if (handled) return;
  handled = true;
  win.webContents.once('did-finish-load', async () => {
    try {
      win.setAlwaysOnTop(true);
      win.show();
      win.focus();
      if (process.env.MARKFIX_PREVIEW_SMOKE) win.setIgnoreMouseEvents(true);
      assert.equal(
        win.getContentBounds().y,
        win.getBounds().y,
        'Main window uses an integrated header',
      );
      assert.equal(win.getTitle(), '', 'Main title stays empty after page load');
      const clickHeaderButton = async (index = 0) => {
        await win.webContents.executeJavaScript(
          `qa.wait(()=>document.querySelectorAll('.header-navigation-controls button')[${index}])`,
        );
        if (process.env.MARKFIX_UIUX_SMOKE) {
          await win.webContents.executeJavaScript(
            `document.querySelectorAll('.header-navigation-controls button')[${index}].click()`,
          );
          return;
        }
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
        `window.qa={wait:async(fn)=>{const end=Date.now()+8000;while(!fn()){if(Date.now()>end)throw Error('UI condition timed out: '+fn);await new Promise(r=>setTimeout(r,50));}},button:(name)=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name),fill:(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));}};qa.wait(()=>document.querySelector('form button[type="submit"]')?.textContent.trim()==='登录')`,
      );
      await run(
        `new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`,
      );
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'desktop-login.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      if (process.env.MARKFIX_LOCAL_ENTRY_SMOKE === 'login') {
        await run(`document.querySelector('.desktop-auth-local').click()`);
        await run(`qa.wait(()=>document.querySelector('[aria-label="新标注"]'))`);
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'desktop-local-entry.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        console.log('PASS local text entry opens the desktop workspace directly');
        console.log('Screenshots: ' + output);
        clearTimeout(timeout);
        server.close();
        return app.quit();
      }
      await run(
        `qa.button('点击创建').click();qa.wait(()=>document.querySelector('input[autocomplete="name"]'))`,
      );
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'desktop-register-form.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      if (process.env.MARKFIX_LOCAL_ENTRY_SMOKE === 'register') {
        assert.equal(
          await run(
            `(()=>{const card=document.querySelector('.desktop-auth-card').getBoundingClientRect(),local=document.querySelector('.desktop-auth-local').getBoundingClientRect();return card.bottom<=local.top})()`,
          ),
          true,
          'register card does not overlap the local entry',
        );
        await run(`document.querySelector('.desktop-auth-local').click()`);
        await run(`qa.wait(()=>document.querySelector('[aria-label="新标注"]'))`);
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'desktop-local-entry-register.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        console.log('PASS empty register form opens the local workspace directly');
        console.log('Screenshots: ' + output);
        clearTimeout(timeout);
        server.close();
        return app.quit();
      }
      assert.equal(
        await run(`document.querySelector('[data-slot="password-field"] input').value`),
        '',
        'switching account modes clears the password',
      );
      await run(
        `const inputs=[...document.querySelectorAll('input')];qa.fill(inputs.find(i=>i.autocomplete==='name'),'新账户');qa.fill(inputs.find(i=>i.type==='email'),'registered@example.test');document.querySelectorAll('[data-slot="password-field"] input').forEach(i=>qa.fill(i,'registered-password'));qa.button('创建账户').click();qa.wait(()=>document.querySelector('[role="status"]'))`,
      );
      assert.match(
        await run(`document.querySelector('[role="status"]').textContent`),
        /验证邮件已发送/,
      );
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'desktop-register.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      await run(
        `qa.button('返回登录').click();qa.wait(()=>document.querySelector('form button[type="submit"]')?.textContent.trim()==='登录')`,
      );
      for (const [label, path] of [
        ['忘记密码', 'forgot-password'],
        ['隐私政策', 'privacy'],
        ['服务条款', 'terms'],
      ]) {
        await run(`qa.button(${JSON.stringify(label)}).click()`);
        await new Promise((r) => setTimeout(r, 80));
        assert.equal(links.at(-1), `${process.env.MARKFIX_SERVICE_ORIGIN}/${path}`);
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
      await run(`localStorage.setItem('markfix:sidebar-width', '228')`);
      await run(`document.querySelector('form button[type="submit"]').click()`);
      await run(
        `qa.wait(()=>qa.button('点击创建').disabled && document.querySelector('.desktop-auth-local').disabled)`,
      );
      assert.equal(
        await run(
          `qa.button('点击创建').disabled && document.querySelector('.desktop-auth-local').disabled`,
        ),
        true,
        'slow authentication disables mode and local-mode switches',
      );
      await run(`qa.wait(()=>document.querySelector('[aria-label="新标注"]'))`);
      assert.equal(await run(`localStorage.getItem('markfix:sidebar-width')`), '228');
      assert.equal(
        await run(
          `document.querySelector('.shell').style.getPropertyValue('--sidebar-peek-width')`,
        ),
        '228px',
      );
      console.log('PASS workspace restores the saved 228px sidebar width');
      console.log('PASS desktop login and account page links');
      if (process.env.MARKFIX_MENU_SMOKE) {
        await run(
          `document.querySelector('.new-project-shortcut-add').click();qa.wait(()=>document.querySelector('#shortcut-name'))`,
        );
        await run(
          `qa.fill(document.querySelector('#shortcut-name'),'快捷方式验收');qa.fill(document.querySelector('#shortcut-url'),'https://shortcut.example.test');`,
        );
        await run(
          `qa.button('完成').click();qa.wait(()=>!document.querySelector('#shortcut-name'))`,
        );
        assert.ok(
          await run(
            `JSON.parse(localStorage.getItem('markfix.website-shortcuts.v1')).some(x=>x.name==='快捷方式验收')`,
          ),
        );
        await run(
          `document.querySelector('[aria-label="管理快捷方式：快捷方式验收"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role=menuitem]'))`,
        );
        await run(
          `[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.trim()==='修改').click();qa.wait(()=>document.querySelector('#shortcut-name'))`,
        );
        await run(`qa.fill(document.querySelector('#shortcut-name'),'已修改快捷方式');`);
        await run(
          `qa.button('完成').click();qa.wait(()=>!document.querySelector('#shortcut-name'))`,
        );
        assert.ok(
          await run(
            `JSON.parse(localStorage.getItem('markfix.website-shortcuts.v1')).some(x=>x.name==='已修改快捷方式')`,
          ),
        );
        await run(
          `document.querySelector('[aria-label="管理快捷方式：已修改快捷方式"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role=menuitem]'))`,
        );
        await run(
          `[...document.querySelectorAll('[role=menuitem]')].find(el=>el.textContent.trim()==='删除').click();qa.wait(()=>document.querySelector('.shortcut-delete-dialog'))`,
        );
        await run(
          `document.querySelector('.shortcut-delete-dialog button:last-child').click();qa.wait(()=>!document.querySelector('.shortcut-delete-dialog'))`,
        );
        assert.equal(
          await run(
            `JSON.parse(localStorage.getItem('markfix.website-shortcuts.v1')).some(x=>x.name==='已修改快捷方式')`,
          ),
          false,
        );
        console.log('PASS shortcut add, edit, delete and persistence after component extraction');
      }
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
        return app.quit();
      }

      if (!process.env.MARKFIX_PREVIEW_SMOKE && !process.env.MARKFIX_MENU_SMOKE) {
        await run(
          `document.querySelector('[aria-label="帮助"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menuitem"]')?.textContent.includes('新功能'))`,
        );
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'account-help.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        await run(
          `if(!document.querySelector('[role="menuitem"]'))document.querySelector('[aria-label="帮助"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menuitem"]')).then(()=>document.querySelector('[role="menuitem"]').click())`,
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(links.at(-1), process.env.MARKFIX_SERVICE_ORIGIN);
        console.log('PASS help menu and default-browser website launch');
      }
      if (process.env.MARKFIX_SERVICE_SMOKE) {
        clearTimeout(timeout);
        server.close();
        return app.quit();
      }

      await run(
        `document.querySelector('[role="radio"][data-value="LOCAL"]').click();qa.fill(document.querySelector('#new-project-url'),'javascript:alert(1)')`,
      );
      await run(
        `document.querySelector('#new-project-url').form.requestSubmit();qa.wait(()=>document.body.textContent.includes('请输入有效的 HTTP 或 HTTPS 网站地址'))`,
      );
      assert.equal(await run(`!!document.querySelector('#new-project-error')`), false);
      await run(
        `qa.wait(()=>{const toast=[...document.querySelectorAll('[data-sonner-toast]')].find(e=>e.textContent.includes('请输入有效'));return toast && getComputedStyle(toast).opacity==='1' && toast.getBoundingClientRect().top>50;})`,
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'project-error-message.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      await run(
        `document.querySelectorAll('[data-close-button]').forEach(button=>button.click());qa.wait(()=>!document.querySelector('[data-sonner-toast]'))`,
      );
      await run(
        `qa.fill(document.querySelector('#new-project-url'),${JSON.stringify(process.env.MARKFIX_SERVICE_ORIGIN + '/site')})`,
      );
      await run(
        `document.querySelector('#new-project-url').form.requestSubmit();qa.wait(()=>document.querySelector('[aria-label="项目操作：界面验收项目"]'))`,
      );
      await run(`qa.wait(()=>!document.querySelector('.browser-bar .spin'))`);
      if (process.env.MARKFIX_AGENT_SMOKE) {
        const openBinding = async () => {
          await run(
            `document.querySelector('[aria-label="项目操作：界面验收项目"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menu"]'))`,
          );
          assert.equal(await run(`document.querySelectorAll('[role="menuitem"]').length`), 2);
          await run(
            `[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.includes('绑定项目')).click();qa.wait(()=>document.querySelector('[aria-label="绑定方式"]'))`,
          );
        };
        await run(
          `document.querySelector('[aria-label="项目操作：界面验收项目"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menu"]'))`,
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'project-menu.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        await run(
          `document.querySelector('[role="menu"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));qa.wait(()=>!document.querySelector('[role="menu"]'))`,
        );
        await openBinding();
        assert.equal(
          await run(
            `document.querySelector('[role="radio"][value="existing"]').getAttribute('aria-checked')`,
          ),
          'true',
        );
        assert.equal(await run(`document.querySelectorAll('.repository-binding input').length`), 0);
        assert.equal(
          win.contentView.children[0].getVisible(),
          false,
          'Target website is hidden behind project dialog',
        );
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'repository-existing.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        await run(
          `document.querySelector('[role="radio"][value="custom"]').click();qa.wait(()=>document.querySelector('.repository-binding input'))`,
        );
        await run(`qa.fill(document.querySelector('.repository-binding input'),'markfix-fixture')`);
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'repository-binding.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        await run(
          `qa.button('保存').click();qa.wait(()=>!document.querySelector('.project-agent-dialog'))`,
        );
        await openBinding();
        await run(
          `document.querySelector('[role="radio"][value="custom"]').click();qa.wait(()=>document.querySelector('.repository-binding input')?.value==='markfix-fixture')`,
        );
        await run(
          `document.querySelector('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));qa.wait(()=>!document.querySelector('.project-agent-dialog'))`,
        );
        await run(
          `document.querySelector('[aria-label="项目操作：界面验收项目"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menu"]'))`,
        );
        await run(
          `[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.includes('删除项目')).click();qa.wait(()=>document.querySelector('[role="alertdialog"]'))`,
        );
        await run(
          `qa.button('取消').click();qa.wait(()=>!document.querySelector('[role="alertdialog"]'))`,
        );
        assert.equal(
          await run(`!!document.querySelector('[aria-label="项目操作：界面验收项目"]')`),
          true,
        );
        await run(
          `document.querySelector('[aria-label="项目操作：界面验收项目"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menu"]'))`,
        );
        await run(
          `[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.includes('删除项目')).click();qa.wait(()=>document.querySelector('[role="alertdialog"]'))`,
        );
        await run(
          `qa.button('删除项目').click();qa.wait(()=>!document.querySelector('[aria-label="项目操作：界面验收项目"]'))`,
        );
        console.log(
          'PASS project menu, default existing mode, custom binding persistence, native isolation, delete cancellation and confirmed deletion',
        );
        console.log('Screenshots: ' + output);
        clearTimeout(timeout);
        server.close();
        return app.quit();
      }
      if (process.env.MARKFIX_MENU_SMOKE) {
        const website = win.contentView.children[0];
        await website.webContents.executeJavaScript(
          `document.body.style.background='#e9eefb';document.querySelector('h1').style.marginLeft='40px'`,
        );
        await new Promise((resolve) => setTimeout(resolve, 200));
        for (let attempt = 0; attempt < 2; attempt++) {
          await run(
            `document.querySelector('.project-sidebar-account').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[aria-label="账号菜单"]'))`,
          );
          await run(
            `qa.wait(()=>document.querySelector('body > img[aria-hidden="true"]')?.complete)`,
          );
          assert.equal(
            await run(
              `document.querySelector('.account-menu [data-slot="dropdown-menu-shortcut"]').textContent`,
            ),
            '⌘,',
          );
          for (let attempt = 0; attempt < 50 && website.getVisible(); attempt++)
            await new Promise((resolve) => setTimeout(resolve, 50));
          assert.equal(
            website.getVisible(),
            false,
            'Native website yields to the open account menu',
          );
          assert.equal(
            await run(
              `document.querySelector('.account-menu').getBoundingClientRect().right > document.querySelector('.project-sidebar').getBoundingClientRect().right`,
            ),
            true,
          );
          assert.equal(
            await run(
              `(()=>{const menu=document.querySelector('.account-menu');const rect=menu.getBoundingClientRect();return menu.contains(document.elementFromPoint(rect.right-10,rect.top+20));})()`,
            ),
            true,
          );
          await new Promise((resolve) => setTimeout(resolve, 200));
          if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
            writeFileSync(
              join(output, 'account-menu-layer.png'),
              (await win.webContents.capturePage()).toPNG(),
            );
          win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
          win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
          await run(
            `qa.wait(()=>!document.querySelector('.account-menu') && !document.querySelector('body > img[aria-hidden="true"]'))`,
          );
          for (let attempt = 0; attempt < 50 && !website.getVisible(); attempt++)
            await new Promise((resolve) => setTimeout(resolve, 50));
          assert.equal(website.getVisible(), true, 'Native website restored after menu dismissal');
        }
        assert.deepEqual(
          await run(
            `[...document.querySelectorAll('.annotation-mode-control [data-slot="kbd"]')].map(key => key.textContent)`,
          ),
          ['⌥W', '⌥A', '⌥B'],
        );
        await run(`window.markfix.openSettings()`);
        const settingsWindow = BrowserWindow.getAllWindows().find((child) => child !== win);
        assert.ok(settingsWindow);
        for (let attempt = 0; attempt < 100; attempt++) {
          if (
            await settingsWindow.webContents.executeJavaScript(
              `document.querySelectorAll('[data-slot="kbd-group"]').length === 6`,
            )
          )
            break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        assert.deepEqual(
          await settingsWindow.webContents.executeJavaScript(
            `[...document.querySelectorAll('[data-slot="kbd-group"]')].map(group=>[...group.querySelectorAll('[data-slot="kbd"]')].map(key=>key.textContent).join(''))`,
          ),
          ['⌘N', '⌘B', '⌘L', '⌥W', '⌥A', '⌘,'],
        );
        await settingsWindow.webContents.executeJavaScript(
          'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
        );
        await new Promise((resolve) => setTimeout(resolve, 250));
        writeFileSync(
          join(output, 'desktop-settings-general.png'),
          (await settingsWindow.webContents.capturePage()).toPNG(),
        );
        await settingsWindow.webContents.executeJavaScript(
          `document.querySelector('[aria-label="上次项目"]').click();document.querySelector('[aria-labelledby="new-annotation-storage-mode-label"] [data-value="LOCAL"]').click()`,
        );
        assert.deepEqual(
          await settingsWindow.webContents.executeJavaScript(
            `[localStorage.getItem('markfix:startup-view'),localStorage.getItem('markfix:new-annotation-storage-mode')]`,
          ),
          ['last-project', 'LOCAL'],
        );
        await settingsWindow.webContents.executeJavaScript(
          `document.querySelector('[role="tab"][data-state="active"]').focus()`,
        );
        settingsWindow.focus();
        settingsWindow.webContents.focus();
        settingsWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Down' });
        settingsWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Down' });
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          await settingsWindow.webContents.executeJavaScript(
            `document.querySelector('[role="tab"][data-state="active"]').textContent.trim()`,
          ),
          '订阅',
        );
        settingsWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Up' });
        settingsWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Up' });
        await new Promise((resolve) => setTimeout(resolve, 100));
        assert.equal(
          await settingsWindow.webContents.executeJavaScript(
            `document.querySelector('[role="tab"][data-state="active"]').textContent.trim()`,
          ),
          '通用',
        );
        await settingsWindow.webContents.executeJavaScript(
          `document.querySelector('[role="tab"][data-state="active"]').focus()`,
        );
        settingsWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Up' });
        settingsWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Up' });
        await settingsWindow.webContents.executeJavaScript(
          `(async()=>{const end=Date.now()+5000;while(!document.querySelector('.settings-account form')){if(Date.now()>end)throw Error('Account settings did not load: '+document.body.innerText);await new Promise(r=>setTimeout(r,50));}const fields=[...document.querySelectorAll('.settings-account input')];const set=(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));};set(fields[0],'fixture-password');set(fields[1],'updated-password');set(fields[2],'updated-password');})()`,
        );
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'settings-account-form.png'),
            (await settingsWindow.webContents.capturePage()).toPNG(),
          );
        await settingsWindow.webContents.executeJavaScript(
          `[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='更新密码').click()`,
        );
        for (let attempt = 0; attempt < 50 && passwordChanges === 0; attempt++)
          await new Promise((resolve) => setTimeout(resolve, 50));
        assert.equal(passwordChanges, 1, 'settings changes the authenticated account password');
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'settings-account.png'),
            (await settingsWindow.webContents.capturePage()).toPNG(),
          );
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'settings-kbd.png'),
            (await settingsWindow.webContents.capturePage()).toPNG(),
          );
        settingsWindow.close();
        console.log('PASS shadcn keyboard hints in toolbar, account menu and settings');
        console.log('PASS account menu above website and repeated open/close restores interaction');
        console.log('Screenshots: ' + output);
        clearTimeout(timeout);
        server.close();
        return app.quit();
      }
      if (process.env.MARKFIX_PREVIEW_SMOKE) {
        const pageUrl = process.env.MARKFIX_SERVICE_ORIGIN + '/site';
        const projectId = await run(
          `window.markfix.listWebsiteProjects().then(items=>items[0].id)`,
        );
        const now = new Date().toISOString();
        const context = {
          projectId,
          pageSessionId: await run(
            `window.markfix.listWebsiteProjects().then(items=>items[0].currentPageSessionId)`,
          ),
          pageTitle: '界面验收项目',
          pageUrl,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
        };
        const dataUrl = (await win.webContents.capturePage()).toDataURL();
        const capture = {
          page: {
            url: 'https://example.test',
            title: 'Fixture page',
            viewportWidthCssPx: 1200,
            viewportHeightCssPx: 800,
            deviceScaleFactor: 1,
            capturedAt: '2026-09-17T00:00:00.000Z',
          },
          capture: {
            mode: 'region',
            imageWidthPx: 1200,
            imageHeightPx: 800,
            widthCssPx: 1200,
            heightCssPx: 800,
            originCssPx: { x: 0, y: 0 },
            captureScale: 1,
            truncated: false,
          },
          ...context,
          id: '22222222-2222-4222-8222-222222222222',
          note: '共用截图记录',
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
        };
        const comment = {
          ...context,
          id: '44444444-4444-4444-8444-444444444444',
          note: '共用元素记录',
          anchor: {
            runtimeEvidence: {
              schemaVersion: 1,
              selectorCandidates: [],
              classNames: [],
              ancestorPath: [],
              nearbyText: [],
              pageBuild: {
                scripts: [],
                stylesheets: [],
                sourceMapHints: [],
                metadata: {},
                frameworkHints: [],
              },
            },
            kind: 'element',
            cssSelector: 'h1',
            tagName: 'H1',
            textQuote: 'Test fixture',
            documentUrl: pageUrl,
            quadsCssPx: [[480, 0, 680, 0, 680, 40, 480, 40]],
          },
        };
        await run(`window.markfix.saveCaptureRecord(${JSON.stringify(capture)})`);
        await run(`window.markfix.saveElementComment(${JSON.stringify(comment)})`);
        await run(
          `window.markfix.saveCaptureRecord(${JSON.stringify({ ...capture, id: '55555555-5555-4555-8555-555555555555' })})`,
        );
        await run(
          `window.markfix.saveDiagnosticAnnotation(${JSON.stringify({ ...context, id: '66666666-6666-4666-8666-666666666666', evidence: { id: '77777777-7777-4777-8777-777777777777', kind: 'command', level: 'info', timestamp: now, pageUrl, title: '命令记录', message: '测试结果' } })})`,
        );
        await run(`sessionStorage.setItem('markfix:browser-mode','comment')`);
        win.webContents.reload();
        await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
        // Reload restores the real renderer and its records from the isolated local store.
        const waitFor = async (expression) => {
          for (let attempt = 0; attempt < 100; attempt++) {
            if (await run(expression)) return;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
          throw new Error('Preview condition timed out: ' + expression);
        };
        await waitFor(`!!document.querySelector('.new-project-shortcut[title="界面验收项目"]')`);
        await run(`document.querySelector('.new-project-shortcut[title="界面验收项目"]').click()`);
        await waitFor(
          `!!document.querySelector('.browser-bar') && !document.querySelector('.browser-bar .spin')`,
        );
        await run(`document.querySelector('[title="批注（⌥W）"]').click()`);
        await waitFor(
          `!!document.querySelector('.element-note-select') && !!document.querySelector('.capture-history-select')`,
        );
        assert.equal(await run(`document.querySelectorAll('aside.comment-panel').length`), 1);
        assert.equal(await run(`!!document.querySelector('.capture-panel-header')`), false);
        const assertNumbers = async (count) => {
          assert.deepEqual(
            await run(
              `[...document.querySelectorAll('.capture-note-head i')].sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top).map(el=>Number(el.textContent))`,
            ),
            Array.from({ length: count }, (_, index) => index + 1),
          );
        };
        assert.equal(
          await run(`document.querySelectorAll('[data-slot="resizable-handle"]').length`),
          2,
        );
        // Keep real cursor movement out of the automated continuous drag sequence.
        if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3');
        await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
          enabled: true,
        });
        win.hide();
        const dragPanel = async (selector, delta) => {
          const sendDragInput = async ({ type, x, y, modifiers }) => {
            if (!win.webContents.debugger.isAttached()) win.webContents.debugger.attach('1.3');
            await win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
              type: {
                mouseMove: 'mouseMoved',
                mouseDown: 'mousePressed',
                mouseUp: 'mouseReleased',
              }[type],
              x,
              y,
              button: type === 'mouseMove' ? 'none' : 'left',
              buttons: type === 'mouseDown' || modifiers?.includes('leftButtonDown') ? 1 : 0,
              clickCount: type === 'mouseMove' ? 0 : 1,
            });
          };
          const point = await run(
            `(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();if(r.width<6)throw Error("Resize handle has no real hit area");const x=Math.round(r.left+r.width/2),y=240;if(document.elementFromPoint(x,y)!==document.querySelector(${JSON.stringify(selector)}))throw Error("Resize handle is covered");return {x,y}})()`,
          );
          const before = win.contentView.children[0].getBounds();
          await sendDragInput({ type: 'mouseMove', ...point });
          await new Promise((resolve) => setTimeout(resolve, 50));
          await sendDragInput({
            type: 'mouseDown',
            button: 'left',
            clickCount: 1,
            ...point,
          });
          await new Promise((resolve) => setTimeout(resolve, 50));
          await sendDragInput({
            type: 'mouseMove',
            x: point.x,
            y: point.y + 1,
            modifiers: ['leftButtonDown'],
          });
          await new Promise((resolve) => setTimeout(resolve, 30));
          for (let step = 1; step <= 5; step++) {
            await sendDragInput({
              type: 'mouseMove',
              x: point.x + Math.round((delta * step) / 5),
              y: point.y,
              modifiers: ['leftButtonDown'],
            });
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          await sendDragInput({
            type: 'mouseUp',
            button: 'left',
            clickCount: 1,
            x: point.x + delta,
            y: point.y,
          });
          await new Promise((resolve) => setTimeout(resolve, 150));
          const after = win.contentView.children[0].getBounds();
          assert.ok(
            Math.abs(
              after.width - before.width - (selector === '.sidebar-resize-handle' ? -delta : delta),
            ) <= 2,
            `Drag must track full pointer distance: ${before.width} -> ${after.width}, delta ${delta}`,
          );
          const edge = await run(
            `document.querySelector('aside.comment-panel').getBoundingClientRect().left`,
          );
          assert.ok(
            Math.abs(after.x + after.width - edge) <= 1,
            'Native website follows dragged panel',
          );
        };
        await dragPanel('.annotation-panel-resize-handle', -30);
        await dragPanel('.annotation-panel-resize-handle', 60);
        await clickHeaderButton();
        await waitFor(`!!document.querySelector('.sidebar-expanded')`);
        await dragPanel('.sidebar-resize-handle', 40);
        await dragPanel('.sidebar-resize-handle', -20);
        await clickHeaderButton();
        await waitFor(`!!document.querySelector('.sidebar-collapsed')`);
        await assertNumbers(4);
        for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowLeft']) {
          await run(
            `document.querySelector('[aria-label="调整批注栏宽度"]').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}))`,
          );
          await new Promise((resolve) => setTimeout(resolve, 100));
          const panelLeft = await run(
            `document.querySelector('aside.comment-panel').getBoundingClientRect().left`,
          );
          const bounds = win.contentView.children[0].getBounds();
          assert.ok(
            Math.abs(bounds.x + bounds.width - panelLeft) <= 1,
            'Website edge follows resized preview',
          );
        }
        await run(
          `document.querySelector('.annotation-panel-resize-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))`,
        );
        await waitFor(`!document.querySelector('aside.comment-panel')`);
        assert.equal(win.contentView.children[0].getBounds().width, win.getContentSize()[0]);
        await run(
          `document.querySelector('.annotation-panel-resize-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`,
        );
        await waitFor(`!!document.querySelector('aside.comment-panel')`);
        console.log('PASS shadcn native drag on both sides, keyboard resize, collapse and restore');
        await run(`document.querySelector('.capture-history-select').click()`);
        await waitFor(`!!document.querySelector('[data-capture-note]')`);
        assert.equal(
          await run(`document.querySelector('[data-capture-note]').value`),
          capture.note,
        );
        assert.equal(await run(`!!document.querySelector('.element-note-select')`), true);
        await assertNumbers(3);
        assert.equal(
          await run(`document.querySelector('[data-capture-note]').hasAttribute('placeholder')`),
          false,
        );
        await run(`document.querySelector('.element-note-select').click()`);
        await waitFor(`!!document.querySelector('[data-element-comment-note]')`);
        assert.equal(
          await run(`document.querySelector('[data-element-comment-note]').value`),
          comment.note,
        );
        assert.equal(await run(`!!document.querySelector('.capture-history-select')`), true);
        await assertNumbers(3);
        assert.equal(
          await run(
            `document.querySelector('[data-element-comment-note]').hasAttribute('placeholder')`,
          ),
          false,
        );
        await run(`document.querySelector('.diagnostic-note-card button[title="删除"]').click()`);
        await waitFor(`!document.querySelector('.diagnostic-note-card')`);
        await assertNumbers(2);
        const target = webContents.getAllWebContents().find((c) => c.getURL() === pageUrl);
        await target.executeJavaScript('window.scrollTo(0,300)');
        assert.equal(await run(`document.querySelectorAll('aside.comment-panel').length`), 1);
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, 'unified-preview.png'),
            (await win.webContents.capturePage()).toPNG(),
          );
        await target.loadURL(pageUrl + '?other=1');
        await waitFor(
          `!document.querySelector('.element-note-select') && !document.querySelector('.capture-history-select') && !document.querySelector('.capture-note-card')`,
        );
        console.log('PASS unified preview, cross-mode replay, scrolling and per-page isolation');
        console.log('Screenshots: ' + output);
        clearTimeout(timeout);
        server.close();
        return app.quit();
      }
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
        '提交标注 · 0',
      );
      assert.equal(
        await run(
          `document.querySelector('.save-annotations-button').querySelectorAll('svg').length`,
        ),
        1,
      );
      assert.equal(
        await run(`document.querySelector('.save-annotations-button').getAttribute('aria-label')`),
        '提交标注 · 0 条待提交',
      );
      assert.equal(await run(`document.querySelector('.save-annotations-button').disabled`), true);
      assert.equal(await run(`document.querySelectorAll('.project-sidebar-item > i').length`), 0);
      for (const expanded of [true, false]) {
        if (!expanded) await run(`document.querySelector('[aria-label="收起项目侧边栏"]').click()`);
        win.setSize(1060, 680);
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.equal(
          await run(
            `(()=>{const bar=document.querySelector('.browser-bar').getBoundingClientRect(), address=document.querySelector('.prototype-browser-bar').getBoundingClientRect(), controls=document.querySelector('.window-controls').getBoundingClientRect(), tools=document.querySelector('.tools').getBoundingClientRect();return (${expanded} ? bar.left>=controls.right : bar.left===0 && bar.right===innerWidth) && document.querySelector('.nav-buttons').getBoundingClientRect().left>=controls.right && getComputedStyle(document.querySelector('.window-controls')).webkitAppRegion==='no-drag' && bar.height===56 && address.height===document.querySelector('.annotation-mode-control').getBoundingClientRect().height && address.top>=0 && address.bottom<=56 && address.left>=controls.right && address.right<=tools.left && tools.right<=innerWidth && [...document.querySelectorAll('.annotation-mode-control button')].every(button=>button.getBoundingClientRect().width>=40 && getComputedStyle(button).opacity==='1')})()`,
          ),
          true,
        );
      }
      if (!process.env.MARKFIX_UIUX_SMOKE) {
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
        await run(
          `qa.wait(()=>document.querySelector('.shell').classList.contains('sidebar-collapsed'))`,
        );
        win.webContents.sendInputEvent({ type: 'mouseMove', x: 600, y: 28 });
        await run(`qa.wait(()=>!document.querySelector('.sidebar-peeking'))`);
        const websiteView = win.contentView.children[0];
        const websiteContents = webContents
          .getAllWebContents()
          .find((c) => c.getURL().includes('/site'));
        // Flush the resized native surface before measuring its renderer viewport.
        await websiteContents.capturePage();
        const layoutDeadline = Date.now() + 8000;
        let viewportWidthBefore = await websiteContents.executeJavaScript('innerWidth');
        while (
          (!websiteView.getVisible() || viewportWidthBefore !== websiteView.getBounds().width) &&
          Date.now() < layoutDeadline
        ) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          viewportWidthBefore = await websiteContents.executeJavaScript('innerWidth');
        }

        assert.equal(
          websiteView.getVisible(),
          true,
          'Measure the visible website before testing hover',
        );
        assert.equal(
          viewportWidthBefore,
          websiteView.getBounds().width,
          'Wait for renderer and native layout to agree',
        );
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
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
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
        if (source)
          writeFileSync(join(output, 'sidebar-hover-native.png'), source.thumbnail.toPNG());
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
        // Keep physical cursor events from interrupting synthetic resize gestures.
        win.setIgnoreMouseEvents(true);
        const dragSidebar = async (targetWidth) => {
          const { from, currentWidth } = await run(
            `(()=>{const handle=document.querySelector('.sidebar-resize-handle').getBoundingClientRect();return {from:Math.round(handle.x+handle.width/2),currentWidth:document.querySelector('.project-sidebar').getBoundingClientRect().width}})()`,
          );
          const to = from + targetWidth - currentWidth;
          win.webContents.sendInputEvent({
            type: 'mouseDown',
            x: from,
            y: 220,
            button: 'left',
            clickCount: 1,
          });
          await new Promise((resolve) => setTimeout(resolve, 100));
          for (const x of [Math.round((from + to) / 2), to]) {
            win.webContents.sendInputEvent({
              type: 'mouseMove',
              x,
              y: 220,
              modifiers: ['leftButtonDown'],
            });
            await new Promise((resolve) => setTimeout(resolve, 75));
          }
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
        await dragSidebar(320);
        await run(
          `qa.wait(()=>document.querySelector('.project-sidebar').getBoundingClientRect().width===320)`,
        );
        await dragSidebar(80);
        await run(`qa.wait(()=>!document.querySelector('.project-sidebar'))`);
        await clickHeaderButton();
        await run(
          `qa.wait(()=>document.querySelector('.project-sidebar')?.getBoundingClientRect().width===320)`,
        );
        await dragSidebar(200);
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
        console.log(
          process.env.MARKFIX_UIUX_SMOKE
            ? 'PASS header actions open sidebar and new annotation'
            : 'PASS mouse click opens sidebar and new annotation',
        );
      } else {
        console.log('SKIP OS-pointer sidebar hover and dragging in focused UI/UX smoke');
      }
      for (const [title, mode] of [
        ['批注（⌥W）', 'comment'],
        ['截图（⌥A）', 'capture'],
      ]) {
        await run(
          `document.querySelector('[title="${title}"]').click();qa.wait(()=>document.querySelector('.annotation-mode-switcher').dataset.mode==='${mode}')`,
        );
        assert.equal(await run(`document.querySelector('.comment-panel')===null`), true);
      }
      await run(
        `document.querySelector('[aria-label="浏览网页"]').click();qa.wait(()=>document.querySelector('.annotation-mode-switcher').dataset.mode==='browse')`,
      );
      console.log('PASS visible browse, comment and capture modes');

      await run(
        `document.querySelector('.preview-toggle-button').click();qa.wait(()=>document.querySelector('.comment-panel'))`,
      );
      const dragRightPanel = async (width) => {
        const { point, currentWidth } = await run(
          `(()=>{const handle=document.querySelector('.annotation-panel-resize-handle').getBoundingClientRect();return {point:{x:Math.round(handle.x+handle.width/2),y:200},currentWidth:document.querySelector('.comment-panel')?.getBoundingClientRect().width??0}})()`,
        );
        win.webContents.sendInputEvent({
          type: 'mouseDown',
          ...point,
          button: 'left',
          clickCount: 1,
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        const x = point.x + currentWidth - width;
        for (const dragX of [Math.round((point.x + x) / 2), x]) {
          win.webContents.sendInputEvent({
            type: 'mouseMove',
            x: dragX,
            y: 200,
            modifiers: ['leftButtonDown'],
          });
          await new Promise((resolve) => setTimeout(resolve, 75));
        }
        win.webContents.sendInputEvent({
          type: 'mouseUp',
          x,
          y: 200,
          button: 'left',
          clickCount: 1,
        });
        await run(
          `qa.wait(()=>(document.querySelector('.comment-panel')?.getBoundingClientRect().width??0)===${width < 160 ? 0 : width})`,
        );
        const viewport = await run(
          `({width:innerWidth,left:document.querySelector('.shell.sidebar-expanded .project-sidebar')?.getBoundingClientRect().width??0,right:document.querySelector('.comment-panel')?.getBoundingClientRect().width??0})`,
        );
        assert.equal(
          win.contentView.children[0].getBounds().width,
          viewport.width - viewport.left - viewport.right,
        );
      };
      if (!process.env.MARKFIX_UIUX_SMOKE) {
        await dragRightPanel(300);
        assert.equal(await run(`localStorage.getItem('markfix:annotation-panel-width')`), '300');
        await dragRightPanel(80);
        await run(
          `document.querySelector('.preview-toggle-button').click();qa.wait(()=>document.querySelector('.comment-panel')?.getBoundingClientRect().width===300)`,
        );
        await dragRightPanel(360);
        await run(
          `document.querySelector('.preview-toggle-button').click();qa.wait(()=>!document.querySelector('.comment-panel'))`,
        );
        console.log('PASS right panel drag, collapse, remembered width and native website bounds');
      } else {
        assert.equal(
          await run(`document.querySelector('.annotation-mode-switcher').dataset.mode`),
          'preview',
        );
        await run(
          `document.querySelector('.preview-toggle-button').click();qa.wait(()=>!document.querySelector('.comment-panel'))`,
        );
        console.log('PASS preview opens and returns to browsing');
      }
      if (process.env.MARKFIX_UIUX_SMOKE)
        console.log('SKIP native fullscreen transitions in focused UI/UX smoke');
      for (const fullscreen of process.env.MARKFIX_UIUX_SMOKE ? [] : [true, false]) {
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
        .find((contents) => contents.getURL() === process.env.MARKFIX_SERVICE_ORIGIN + '/site');
      assert.ok(target);
      for (const path of ['/site', '/site?reload=1']) {
        if (path !== '/site') await target.loadURL(process.env.MARKFIX_SERVICE_ORIGIN + path);
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
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
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
      const pageUrl = process.env.MARKFIX_SERVICE_ORIGIN + '/site';
      await run(
        `window.markfix.saveCaptureRecord(${JSON.stringify({
          page: {
            url: 'https://example.test',
            title: 'Fixture page',
            viewportWidthCssPx: 1200,
            viewportHeightCssPx: 800,
            deviceScaleFactor: 1,
            capturedAt: '2026-09-17T00:00:00.000Z',
          },
          capture: {
            mode: 'region',
            imageWidthPx: 1200,
            imageHeightPx: 800,
            widthCssPx: 1200,
            heightCssPx: 800,
            originCssPx: { x: 0, y: 0 },
            captureScale: 1,
            truncated: false,
          },
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
          while(document.querySelector('.loading') || !document.querySelector('#root')?.textContent || document.querySelector('#root').textContent.includes('正在加载')){
            if(Date.now()>end)throw Error('Child renderer did not finish loading');
            await new Promise(resolve=>setTimeout(resolve,50));
          }
        })()`);
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
          writeFileSync(
            join(output, name + '.png'),
            (await child.webContents.capturePage()).toPNG(),
          );
        child.close();
      }
      console.log('PASS integrated main header and native child title bars');
      await run(`window.markfix.openAnnotationReview(${JSON.stringify(projectId)})`);
      const review = BrowserWindow.getAllWindows().find((candidate) => candidate !== win);
      assert.ok(review);
      await review.webContents.executeJavaScript(`(async()=>{
        const end=Date.now()+8000;
        while(!document.querySelector('.annotation-save-dialog footer button') || document.querySelector('.annotation-save-dialog footer button').disabled){
          if(Date.now()>end)throw Error('Submission did not become ready');
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        if(!document.querySelector('.annotation-review-heading').textContent.includes('界面验收项目 · 仅本机'))throw Error('Incorrect submission destination');
        document.querySelector('.annotation-save-dialog footer button').click();
      })()`);
      await run(
        `qa.wait(()=>[...document.querySelectorAll('[data-sonner-toast] button')].some(button=>button.textContent==='查看已提交记录'))`,
      );
      assert.equal(
        await run(
          `window.markfix.listCaptureRecords(${JSON.stringify(projectId)}).then(items=>items.find(item=>item.id===${JSON.stringify(captureId)})?.status)`,
        ),
        'submitted',
      );
      await run(
        `[...document.querySelectorAll('[data-sonner-toast] button')].find(button=>button.textContent==='查看已提交记录').click()`,
      );
      const history = BrowserWindow.getAllWindows().find((candidate) => candidate !== win);
      assert.ok(history);
      const historyDeadline = Date.now() + 8000;
      while (!history.webContents.getURL() && Date.now() < historyDeadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      assert.ok(history.webContents.getURL().includes(encodeURIComponent(projectId)));
      if (history.webContents.isLoading())
        await new Promise((resolve) => history.webContents.once('did-finish-load', resolve));
      await history.webContents.executeJavaScript(`(async()=>{
        const end=Date.now()+8000;
        while(!document.querySelector('.project-history-window')?.textContent.includes('标题栏验收截图')){
          if(Date.now()>end)throw Error('Submitted annotation did not appear in history');
          await new Promise(resolve=>setTimeout(resolve,50));
        }
        if(document.querySelector('.project-history-error'))throw Error('History failed to load');
      })()`);
      history.close();
      console.log('PASS submission destination, saved state and submitted-history action');

      if (await run(`!!document.querySelector('[aria-label="展开项目侧边栏"]')`))
        await clickHeaderButton();
      await run(`qa.wait(()=>document.querySelector('[aria-label="项目操作：界面验收项目"]'))`);
      await run(
        `document.querySelector('[aria-label="项目操作：界面验收项目"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menu"]')).then(()=>{[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.includes('删除项目')).click();return qa.wait(()=>document.querySelector('[role="alertdialog"]'));})`,
      );
      await run(`qa.wait(()=>document.activeElement?.textContent==='取消')`);
      assert.equal(
        await run(`getComputedStyle(qa.button('删除项目')).backgroundColor`),
        'rgb(180, 35, 24)',
      );
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (!process.env.MARKFIX_SMOKE_NO_SCREENSHOTS)
        writeFileSync(
          join(output, 'delete-project.png'),
          (await win.webContents.capturePage()).toPNG(),
        );
      await run(
        `qa.button('取消').click();qa.wait(()=>!document.querySelector('[role="alertdialog"]'))`,
      );
      assert.equal(
        await run(`!!document.querySelector('[aria-label="项目操作：界面验收项目"]')`),
        true,
      );
      await run(
        `document.querySelector('[aria-label="项目操作：界面验收项目"]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerType:'mouse'}));qa.wait(()=>document.querySelector('[role="menu"]')).then(()=>{[...document.querySelectorAll('[role="menuitem"]')].find(e=>e.textContent.includes('删除项目')).click();return qa.wait(()=>document.querySelector('[role="alertdialog"]'));})`,
      );
      await run(
        `qa.button('删除项目').click();qa.wait(()=>!document.querySelector('[aria-label="项目操作：界面验收项目"]'))`,
      );
      console.log(
        'PASS error message, red confirmation, cancel, and disposable local project deletion',
      );
      console.log('Screenshots: ' + output);
      clearTimeout(timeout);
      server.close();
      return app.quit();
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
      return app.exit(1);
    }
  });
});
server.listen(0, '127.0.0.1', () => {
  process.env.MARKFIX_SERVICE_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  delete process.env.MARKFIX_ALLOW_HTTP;
  import(join(root, 'apps/desktop/out/main/index.js')).catch((e) => {
    console.error(e);
    return app.exit(1);
  });
});
