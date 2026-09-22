import { URL } from 'node:url';
import { app, webContents, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const marketing = process.env.MARKFIX_MARKETING_ASSETS === '1';
const saveElementScreenshot = process.env.MARKFIX_SMOKE_ELEMENT_SCREENSHOT === '1';
const profile = mkdtempSync(join(tmpdir(), 'markfix-inline-'));
const output = process.env.MARKFIX_SMOKE_OUTPUT_DIR || join(profile, 'evidence');
mkdirSync(output, { recursive: true });
app.setPath('userData', profile);
const server = createServer((req, res) => {
  if (req.url.startsWith('/site')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      marketing
        ? readFileSync(new URL('./marketing-fixture.html', import.meta.url), 'utf8')
        : '<!doctype html><title>备注验收</title><style>body{margin:32px;height:2200px;background:#f7f8fa;font:18px system-ui}h1{margin-top:100px;width:400px;background:white;padding:20px}</style><h1 id="subject">需要修改的页面标题</h1><p>截图与备注交互验收</p>',
    );
  } else {
    res.setHeader('Content-Type', 'application/json');
    res.end('{}');
  }
});
const timeout = setTimeout(() => {
  console.error('inline smoke timeout');
  app.exit(1);
}, 60000);
let handled = false;
app.on('browser-window-created', (_event, win) => {
  if (handled) return;
  handled = true;
  win.webContents.once('did-finish-load', async () => {
    try {
      if (marketing) win.setSize(1440, 900);
      win.show();
      win.focus();
      const run = (code) =>
        win.webContents.executeJavaScript(code).catch((error) => {
          console.error('Failed:', code);
          throw error;
        });
      const wait = async (fn) => {
        for (let n = 0; n < 100; n++) {
          if (await fn()) return;
          await delay(50);
        }
        throw new Error('UI condition timed out');
      };
      await wait(() => run(`!!document.querySelector('.desktop-auth-local')`));
      await run(`document.querySelector('.desktop-auth-local').click()`);
      await wait(() => run(`!!document.querySelector('#new-project-url')`));
      await run(`window.markfix.openSettings()`);
      const settings = BrowserWindow.getAllWindows().find((child) => child !== win);
      assert.ok(settings);
      const settingsRun = (code) => settings.webContents.executeJavaScript(code);
      await wait(() => settingsRun(`!!document.querySelector('#element-comment-screenshot')`));
      assert.equal(
        await settingsRun(
          `document.querySelector('#element-comment-screenshot').getAttribute('aria-checked')`,
        ),
        'false',
        'Text annotation screenshots default to disabled',
      );
      if (saveElementScreenshot) {
        await settingsRun(`document.querySelector('#element-comment-screenshot').click()`);
        await wait(() =>
          run(`localStorage.getItem('markfix:element-comment-screenshot') === 'true'`),
        );
      }
      settings.close();
      await run(`window.markfix.openSettings()`);
      const reopenedSettings = BrowserWindow.getAllWindows().find((child) => child !== win);
      await wait(() =>
        reopenedSettings.webContents.executeJavaScript(
          `!!document.querySelector('#element-comment-screenshot')`,
        ),
      );
      assert.equal(
        await reopenedSettings.webContents.executeJavaScript(
          `document.querySelector('#element-comment-screenshot').getAttribute('aria-checked')`,
        ),
        String(saveElementScreenshot),
        'Screenshot preference survives reopening settings',
      );
      reopenedSettings.close();
      const url = process.env.MARKFIX_SERVICE_ORIGIN + '/site';
      await run(
        `(()=>{const el=document.querySelector('#new-project-url');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(url)});el.dispatchEvent(new Event('input',{bubbles:true}));})()`,
      );
      await delay(100);
      await run(`document.querySelector('#new-project-url').form.requestSubmit()`);
      await wait(() => run(`!!document.querySelector('.annotation-mode-control')`));
      await wait(() => webContents.getAllWebContents().some((c) => c.getURL() === url));
      const target = webContents.getAllWebContents().find((c) => c.getURL() === url);
      await delay(350);
      if (!target.debugger.isAttached()) target.debugger.attach('1.3');
      const command = (method, params) => target.debugger.sendCommand(method, params);
      const field = async (tag, operation = 'rect') => {
        const { root } = await command('DOM.getDocument', { depth: -1, pierce: true });
        const find = (node) => {
          if (
            (node.nodeName === tag ||
              (tag === 'OUTLINE' && node.attributes?.includes('data-element-comment-outline')) ||
              (tag === 'TOOLBAR' && node.attributes?.includes('截图工具栏')) ||
              (tag === 'ELEMENTPIN' &&
                node.attributes?.includes('data-annotation-type') &&
                node.attributes?.includes('element')) ||
              (tag === 'CAPTUREPIN' &&
                node.attributes?.includes('data-annotation-type') &&
                node.attributes?.includes('capture'))) &&
            (tag !== 'BUTTON' || node.children?.some((c) => c.nodeValue === '提交'))
          )
            return node;
          for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) {
            const found = find(child);
            if (found) return found;
          }
        };
        const node = find(root);
        if (!node) return null;
        const { object } = await command('DOM.resolveNode', { backendNodeId: node.backendNodeId });
        const expression =
          operation === 'inputState'
            ? '({value:this.value, focused:this.getRootNode().activeElement===this, end:this.selectionEnd, scrollLeft:this.scrollLeft, scrollWidth:this.scrollWidth, clientWidth:this.clientWidth})'
            : operation === 'outlineState'
              ? '({x:Number(this.getAttribute("x")),y:Number(this.getAttribute("y")),width:Number(this.getAttribute("width")),height:Number(this.getAttribute("height")),stroke:this.getAttribute("stroke"),pointerEvents:this.style.pointerEvents})'
              : operation === 'pinState'
                ? '(()=>{const c=this.querySelector("circle");return {fill:c.getAttribute("fill"),x:Number(c.getAttribute("cx")),y:Number(c.getAttribute("cy"))}})()'
                : operation === 'value'
                  ? 'this.value'
                  : operation === 'disabled'
                    ? 'this.disabled'
                    : '(()=>{const r=this.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2),width:r.width,height:r.height}})()';
        const { result } = await command('Runtime.callFunctionOn', {
          objectId: object.objectId,
          functionDeclaration: `function(){return ${expression}}`,
          returnByValue: true,
        });
        return result.value;
      };
      const pinCount = async () => {
        const { root } = await command('DOM.getDocument', { depth: -1, pierce: true });
        const count = (node) =>
          node.attributes?.includes('markfix-element-comments')
            ? (node.children || []).filter((child) => child.attributes?.includes('element')).length
            : [...(node.children || []), ...(node.shadowRoots || [])].reduce(
                (sum, child) => sum + count(child),
                0,
              );
        return count(root);
      };
      const click = async (point) => {
        win.focus();
        target.focus();
        target.sendInputEvent({ type: 'mouseMove', ...point });
        target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
        target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
        await delay(100);
      };
      const mode = async (value) => {
        await run(
          `document.querySelector('.annotation-mode-control button[data-state][title^="${value === 'capture' ? '截图' : '批注'}"]').click()`,
        );
        await delay(200);
        assert.equal(await run(`!!document.querySelector('aside.comment-panel')`), false);
      };
      if (process.env.MARKFIX_SMOKE_TEXT_PREFERENCE === '1') {
        await mode('comment');
        await click({ x: 120, y: 150 });
        await wait(async () => (await field('INPUT'))?.width > 0);
        await click(await field('INPUT'));
        await target.insertText('截图配置验收');
        await wait(async () => (await field('BUTTON', 'disabled')) === false);
        await click(await field('BUTTON'));
        const records = () =>
          run(
            `window.markfix.listElementComments((await window.markfix.listWebsiteProjects())[0].id)`,
          );
        await wait(async () => (await records()).length === 1);
        const [saved] = await records();
        assert.equal(saved.note, '截图配置验收');
        assert.equal(Boolean(saved.screenshotDataUrl), saveElementScreenshot);
        assert.equal(Boolean(saved.capture), saveElementScreenshot);
        await run(`window.markfix.openSettings()`);
        const verifiedSettings = BrowserWindow.getAllWindows().find((child) => child !== win);
        await wait(() =>
          verifiedSettings.webContents.executeJavaScript(
            `!!document.querySelector('#element-comment-screenshot')`,
          ),
        );
        writeFileSync(
          join(output, 'screenshot-preference.png'),
          (await verifiedSettings.webContents.capturePage()).toPNG(),
        );
        console.log(
          'PASS text screenshot preference: ' +
            saveElementScreenshot +
            '; settings persistence and saved annotation verified',
        );
        console.log('Evidence: ' + output);
        clearTimeout(timeout);
        server.close();
        app.exit(0);
        return;
      }
      const screenshot = async (name) => {
        if (marketing) {
          const { captureMarketingFrame } = await import('./capture-marketing-frame.mjs');
          await captureMarketingFrame(win, target, join(output, name));
          return;
        }
        if (process.env.MARKFIX_SMOKE_SCREENSHOTS !== '1') return;
        writeFileSync(join(output, name), (await win.webContents.capturePage()).toPNG());
        writeFileSync(join(output, 'target-' + name), (await target.capturePage()).toPNG());
      };
      assert.equal(
        await run(`document.querySelectorAll('.annotation-mode-control button').length`),
        3,
      );
      if (marketing) await delay(4500);
      await mode('capture');
      const frozen = await run(`window.markfix.capture({mode:'visible'})`);
      assert.equal(
        frozen.viewportWidthCssPx,
        await target.executeJavaScript('innerWidth'),
        'Frozen frame and visible viewport use the same coordinates',
      );
      await target.executeJavaScript(
        `document.querySelector('#subject').textContent='临时状态已消失';document.body.style.background='#ff0000'`,
      );
      await delay(150);
      assert.equal(
        (await run(`window.markfix.capture({mode:'visible'})`)).dataUrl,
        frozen.dataUrl,
        'Frame is fixed before selecting a region',
      );
      if (marketing) await target.executeJavaScript("document.body.style.background='#f7f8fa'");
      target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: 30, y: 80 });
      target.sendInputEvent({ type: 'mouseMove', x: 900, y: 300 });
      target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: 900, y: 300 });
      await wait(async () => (await field('INPUT'))?.width > 0);
      target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: 900, y: 220 });
      target.sendInputEvent({ type: 'mouseMove', x: 940, y: 220 });
      target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: 940, y: 220 });
      await delay(150);
      target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: 100, y: 140 });
      target.sendInputEvent({ type: 'mouseMove', x: 240, y: 210 });
      target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: 240, y: 210 });
      await delay(350);
      target.focus();
      await click(await field('INPUT'));
      await wait(async () => (await field('INPUT', 'inputState')).focused);
      await command('Input.imeSetComposition', {
        text: 'jie tu',
        selectionStart: 6,
        selectionEnd: 6,
      });
      await delay(200);
      assert.equal(await field('INPUT', 'value'), 'jie tu', 'Composition survives state echoes');
      await command('Input.insertText', { text: '请增加标题留白，让内容更易阅读' });
      await delay(200);
      assert.equal(await field('INPUT', 'value'), '请增加标题留白，让内容更易阅读');
      await target.insertText('连续输入的历史文字'.repeat(12));
      await delay(150);
      const typing = await field('INPUT', 'inputState');
      assert.equal(
        typing.value,
        '请增加标题留白，让内容更易阅读' + '连续输入的历史文字'.repeat(12),
      );
      assert.equal(typing.end, typing.value.length);
      assert.ok(typing.scrollLeft > 0, 'Single-line input follows the latest text');
      target.selectAll();
      await target.insertText('请增加标题留白，让内容更易阅读');
      await wait(async () => (await field('BUTTON', 'disabled')) === false);
      assert.equal(
        (await field('FORM')).height,
        (await field('TOOLBAR')).height,
        'Input matches toolbar height',
      );
      assert.equal(
        (await field('FORM')).y,
        (await field('TOOLBAR')).y,
        'Input aligns with toolbar',
      );
      await screenshot('capture-inline.png');
      target.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
      target.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      await wait(() =>
        run(
          `document.querySelector('aside.comment-panel')?.textContent.includes('请增加标题留白，让内容更易阅读')`,
        ),
      );
      const captures = await run(
        `window.markfix.desktopBootstrap().then(({websiteProjects}) => window.markfix.listCaptureRecords(websiteProjects[0].id))`,
      );
      assert.equal(
        captures[0].selection.widthCssPx,
        910,
        'Drag selection edge resizes without a mouse tool',
      );
      assert.equal(captures[0].marks[0].type, 'rectangle', 'Rectangle is selected by default');
      assert.equal(
        captures[0].note,
        '请增加标题留白，让内容更易阅读',
        'No intermediate pinyin is saved',
      );
      if (marketing)
        await target.executeJavaScript(
          "document.querySelector('#subject').textContent='让每一处细节，都更进一步。';document.body.style.background='#f7f8fa'",
        );
      await screenshot('capture-preview.png');
      assert.equal((await field('CAPTUREPIN', 'pinState')).fill, '#7357d9');
      await click(await field('CAPTUREPIN'));
      await wait(async () => (await field('INPUT', 'value')) === captures[0].note);
      assert.equal(await run(`!!document.querySelector('[role="alertdialog"]')`), false);
      await wait(async () => (await field('CAPTUREPIN', 'pinState'))?.fill === '#16a34a');
      await click(await field('INPUT'));
      target.selectAll();
      await target.insertText('截图修改后的文字');
      await click({ x: 160, y: 120 });
      target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: 160, y: 120 });
      target.sendInputEvent({ type: 'mouseMove', x: 220, y: 170 });
      target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: 220, y: 170 });
      // Allow the marks IPC to start its asynchronous screenshot render before checking readiness.
      await delay(350);
      await wait(async () => (await field('BUTTON', 'disabled')) === false);
      await click(await field('BUTTON'));
      await wait(() => run(`!!document.querySelector('aside.comment-panel')`));
      await wait(async () => (await field('CAPTUREPIN', 'pinState'))?.fill === '#7357d9');
      const editedCaptures = await run(
        `window.markfix.desktopBootstrap().then(({websiteProjects}) => window.markfix.listCaptureRecords(websiteProjects[0].id))`,
      );
      assert.equal(editedCaptures.length, 1);
      assert.equal(editedCaptures[0].id, captures[0].id);
      assert.equal(editedCaptures[0].note, '截图修改后的文字');
      assert.equal(editedCaptures[0].sourceDataUrl, captures[0].sourceDataUrl);
      assert.notEqual(editedCaptures[0].dataUrl, captures[0].dataUrl);
      assert.ok(
        editedCaptures[0].marks.length > captures[0].marks.length,
        'Screenshot edits persist on the same record',
      );

      await mode('capture');
      assert.equal((await field('INPUT'))?.width ?? 0, 0, 'A new capture requires a new selection');
      await mode('comment');
      await click({ x: 120, y: 150 });
      await wait(async () => (await field('INPUT'))?.width > 0);
      await delay(350);
      target.focus();
      await click(await field('INPUT'));
      await target.insertText('请统一标题字号与设计规范');
      await wait(async () => (await field('BUTTON', 'disabled')) === false);
      await screenshot('element-inline.png');
      await click(await field('BUTTON'));
      await wait(() =>
        run(
          `document.querySelector('aside.comment-panel')?.textContent.includes('请统一标题字号与设计规范')`,
        ),
      );
      assert.deepEqual(
        await run(`[...document.querySelectorAll('.capture-note-head i')].map(e=>e.textContent)`),
        ['1', '2'],
      );
      const savedElementComments = await run(
        `window.markfix.listElementComments((await window.markfix.listWebsiteProjects())[0].id)`,
      );
      assert.equal(savedElementComments.length, 1);
      assert.equal(Boolean(savedElementComments[0].screenshotDataUrl), saveElementScreenshot);
      assert.equal(Boolean(savedElementComments[0].capture), saveElementScreenshot);
      await screenshot('element-preview.png');
      await run(
        `if (!document.querySelector('aside.comment-panel')) document.querySelector('.preview-toggle-button').click()`,
      );
      await wait(() => run(`!!document.querySelector('.element-note-select')`));
      await run(`document.querySelector('.element-note-select').click()`);
      await wait(() => run(`!document.querySelector('aside.comment-panel')`));
      await wait(async () => (await field('INPUT', 'value')) === '请统一标题字号与设计规范');
      const websiteView = win.contentView.children.find((view) => view.webContents === target);
      assert.ok(websiteView, 'Target website view is attached');
      // Opening the same record restores it directly, even while editing.
      await run(`document.querySelector('.preview-toggle-button').click()`);
      await wait(() => run(`!!document.querySelector('.element-note-select')`));
      await run(`document.querySelector('.element-note-select').click()`);
      await wait(() => run(`!document.querySelector('aside.comment-panel')`));
      assert.equal(await run(`!!document.querySelector('[role="alertdialog"]')`), false);
      await wait(async () => (await field('INPUT', 'value')) === '请统一标题字号与设计规范');
      await click(await field('INPUT'));
      target.selectAll();
      await target.insertText('编辑时点击输入框');
      await wait(async () => (await field('INPUT', 'value')) === '编辑时点击输入框');
      const openModeDialog = async () => {
        await run(
          `document.querySelector('.annotation-mode-control button[title^="截图"]').click()`,
        );
        await wait(() => run(`!!document.querySelector('[role="alertdialog"]')`));
        await wait(() => !websiteView.getVisible());
      };
      const clickModeDialogButton = async (label) => {
        const point = await run(
          `(()=>{const button=[...document.querySelectorAll('[role="alertdialog"] button')].find(el=>el.textContent===${JSON.stringify(label)});const r=button.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
        );
        win.webContents.focus();
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
        await wait(() => run(`!document.querySelector('[role="alertdialog"]')`));
        await wait(() => websiteView.getVisible());
      };
      await openModeDialog();
      writeFileSync(
        join(output, 'mode-confirmation.png'),
        (await win.webContents.capturePage()).toPNG(),
      );
      await clickModeDialogButton('取消');
      assert.equal(
        await field('INPUT', 'value'),
        '编辑时点击输入框',
        'Cancel preserves the current edit',
      );
      await openModeDialog();
      await clickModeDialogButton('放弃并切换');
      await mode('comment');
      const pin = await field('ELEMENTPIN');
      assert.ok(pin, 'Saved annotation pin exists');
      await click(pin);
      await wait(async () => (await field('INPUT', 'value')) === '请统一标题字号与设计规范');
      await click(await field('INPUT'));
      assert.equal(
        (await field('INPUT', 'inputState')).focused,
        true,
        'Editor click focuses the input',
      );
      assert.equal((await field('ELEMENTPIN', 'pinState')).fill, '#16a34a');
      const assertSeparatedPins = async () => {
        const element = await field('ELEMENTPIN', 'pinState');
        const capture = await field('CAPTUREPIN', 'pinState');
        assert.ok(
          Math.hypot(element.x - capture.x, element.y - capture.y) >= 26,
          'Overlapping screenshot and element badges are separated',
        );
      };
      await assertSeparatedPins();

      await target.executeJavaScript("document.body.style.marginLeft='0'");
      await wait(async () => (await field('ELEMENTPIN', 'pinState')).x === 12);
      await target.executeJavaScript("document.body.style.marginLeft='32px'");
      await wait(async () => (await field('ELEMENTPIN', 'pinState')).x === 32);

      const assertOutline = async () => {
        const bounds = await target.executeJavaScript(
          `(()=>{const r=document.querySelector('#subject').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()`,
        );
        const outline = await field('OUTLINE', 'outlineState');
        assert.deepEqual(outline, { ...bounds, stroke: '#c4b5fd', pointerEvents: 'none' });
      };
      await assertOutline();
      writeFileSync(join(output, 'annotation-pin-edit.png'), (await target.capturePage()).toPNG());
      await wait(() => run(`!document.querySelector('aside.comment-panel')`));
      await wait(async () => (await field('INPUT', 'value')) === '请统一标题字号与设计规范');
      await target.executeJavaScript('scrollTo(0,100)');
      await delay(200);
      await assertOutline();
      await assertSeparatedPins();
      await screenshot('element-scroll.png');
      await delay(350);
      target.focus();
      await click(await field('INPUT'));
      target.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      target.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await delay(100);
      await run(
        `if (!document.querySelector('aside.comment-panel')) document.querySelector('.preview-toggle-button').click()`,
      );
      await wait(() => run(`!!document.querySelector('.element-note-select')`));
      await run(`document.querySelector('.element-note-select').click()`);
      await wait(() => run(`!document.querySelector('aside.comment-panel')`));
      await wait(async () => (await field('INPUT', 'value')) === '请统一标题字号与设计规范');
      await wait(async () => (await pinCount()) === 1);
      await target.loadURL(url + '?other=1');
      await delay(250);
      await run(
        `if (!document.querySelector('aside.comment-panel')) document.querySelector('.preview-toggle-button').click()`,
      );
      await wait(() => run(`!!document.querySelector('aside.comment-panel')`));
      assert.equal(
        await run(`document.body.textContent.includes('请统一标题字号与设计规范')`),
        true,
        'Project preview includes records from other pages',
      );
      await run(`window.markfix.setMode('comment')`);
      await delay(200);
      assert.equal(await pinCount(), 0, 'Other page has no element annotation pins');
      assert.equal(await field('OUTLINE'), null, 'Other pages have no annotation outlines');
      await target.loadURL(url);
      if (marketing)
        await target.executeJavaScript(
          "document.querySelector('#subject').textContent='让每一处细节，都更进一步。';document.body.style.background='#f7f8fa'",
        );
      await run(`window.markfix.setMode('comment')`);
      await delay(200);
      await run(
        `if (!document.querySelector('aside.comment-panel')) document.querySelector('.preview-toggle-button').click()`,
      );
      await wait(() => run(`!!document.querySelector('.element-note-select')`));
      await run(`document.querySelector('.element-note-select').click()`);
      await wait(async () => (await pinCount()) === 1);
      await delay(300);
      await run(`document.querySelector('.preview-toggle-button').click()`);
      await wait(() =>
        run(
          `document.querySelector('aside.comment-panel')?.textContent.includes('请统一标题字号与设计规范')`,
        ),
      );
      await assertOutline();
      await screenshot('replayed-preview.png');
      if (marketing) {
        await run(`document.querySelector('.save-annotations-button').click()`);
        let review;
        await wait(async () => {
          review = BrowserWindow.getAllWindows().find((candidate) => candidate !== win);
          return (
            review &&
            (await review.webContents.executeJavaScript(
              `!!document.querySelector('.annotation-save-item')`,
            ))
          );
        });
        await delay(400);
        writeFileSync(
          join(output, 'annotation-review.png'),
          (await review.webContents.capturePage()).toPNG(),
        );
        review.close();
        await delay(500);
      }
      if (!marketing) {
        await run(`(async () => {
          const [project] = await window.markfix.listWebsiteProjects();
          const elementComments = await window.markfix.listElementComments(project.id);
          const captures = await window.markfix.listCaptureRecords(project.id);
          await window.markfix.saveAnnotationSubmission({
            id: crypto.randomUUID(), projectId: project.id, elementComments, captures,
            diagnostics: [], submittedAt: new Date().toISOString(),
          });
        })()`);
        await wait(() =>
          run(`document.querySelector('aside.comment-panel')?.textContent.includes('暂无批注')`),
        );
        const overlayEmpty = async () => {
          const { root } = await command('DOM.getDocument', { depth: -1, pierce: true });
          const count = (node) =>
            node.attributes?.includes('markfix-element-comments')
              ? (node.children || []).length
              : [...(node.children || []), ...(node.shadowRoots || [])].reduce(
                  (sum, child) => sum + count(child),
                  0,
                );
          return count(root) === 0;
        };
        await wait(overlayEmpty);
        await target.reload();
        await delay(700);
        await wait(overlayEmpty);
        console.log(
          'PASS submission clears preview, element outlines and all pins, including after reload',
        );
      }
      console.log(
        'PASS fresh capture, inline Enter and click submission, automatic preview visibility, editing, scrolling, project-wide preview, route changes, per-page pin isolation and saved replay',
      );
      console.log('Evidence: ' + output);
      clearTimeout(timeout);
      server.close();
      app.quit();
    } catch (error) {
      console.error(error);
      writeFileSync(join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
      const failedTarget = webContents
        .getAllWebContents()
        .find((contents) =>
          contents.getURL().startsWith(process.env.MARKFIX_SERVICE_ORIGIN + '/site'),
        );
      if (failedTarget)
        writeFileSync(
          join(output, 'target-failure.png'),
          (await failedTarget.capturePage()).toPNG(),
        );
      clearTimeout(timeout);
      server.close();
      app.exit(1);
    }
  });
});
server.listen(0, '127.0.0.1', () => {
  process.env.MARKFIX_SERVICE_ORIGIN = `http://127.0.0.1:${server.address().port}`;
  import(resolve(import.meta.dirname, '../out/main/index.js')).catch((error) => {
    console.error(error);
    app.exit(1);
  });
});
