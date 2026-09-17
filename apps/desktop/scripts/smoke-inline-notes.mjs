import { app, webContents } from 'electron';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { setTimeout, clearTimeout } from 'node:timers';
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
const profile = mkdtempSync(join(tmpdir(), 'markfix-inline-'));
const output = process.env.MARKFIX_SMOKE_OUTPUT_DIR || join(profile, 'evidence');
mkdirSync(output, { recursive: true });
app.setPath('userData', profile);
const server = createServer((req, res) => {
  if (req.url.startsWith('/site')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(
      '<!doctype html><title>备注验收</title><style>body{margin:32px;height:2200px;background:#f7f8fa;font:18px system-ui}h1{margin-top:100px;width:400px;background:white;padding:20px}</style><h1 id="subject">需要修改的页面标题</h1><p>截图与备注交互验收</p>',
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
              (tag === 'TOOLBAR' && node.attributes?.includes('截图工具栏'))) &&
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
        const { object } = await command('DOM.resolveNode', { nodeId: node.nodeId });
        const expression =
          operation === 'value'
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
      const click = async (point) => {
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
      const screenshot = async (name) => {
        writeFileSync(join(output, name), (await win.webContents.capturePage()).toPNG());
        writeFileSync(join(output, 'target-' + name), (await target.capturePage()).toPNG());
      };
      await mode('capture');
      target.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x: 30, y: 80 });
      target.sendInputEvent({ type: 'mouseMove', x: 900, y: 300 });
      target.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x: 900, y: 300 });
      await wait(async () => (await field('TEXTAREA'))?.width > 0);
      await delay(350);
      target.focus();
      await click(await field('TEXTAREA'));
      await target.insertText('截图备注验收');
      assert.equal(await field('TEXTAREA', 'value'), '截图备注验收');
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
        run(`document.querySelector('aside.comment-panel')?.textContent.includes('截图备注验收')`),
      );
      await screenshot('capture-preview.png');
      await mode('capture');
      assert.equal(
        (await field('TEXTAREA'))?.width ?? 0,
        0,
        'A new capture requires a new selection',
      );
      await mode('comment');
      await click({ x: 120, y: 150 });
      await wait(async () => (await field('TEXTAREA'))?.width > 0);
      await delay(350);
      target.focus();
      await click(await field('TEXTAREA'));
      await target.insertText('元素备注验收');
      await wait(async () => (await field('BUTTON', 'disabled')) === false);
      await screenshot('element-inline.png');
      await click(await field('BUTTON'));
      await wait(() =>
        run(`document.querySelector('aside.comment-panel')?.textContent.includes('元素备注验收')`),
      );
      assert.deepEqual(
        await run(`[...document.querySelectorAll('.capture-note-head i')].map(e=>e.textContent)`),
        ['1', '2'],
      );
      await screenshot('element-preview.png');
      await run(`document.querySelector('.element-note-select').click()`);
      await wait(async () => (await field('TEXTAREA', 'value')) === '元素备注验收');
      await target.executeJavaScript('scrollTo(0,100)');
      await delay(200);
      await screenshot('element-scroll.png');
      await delay(350);
      target.focus();
      await click(await field('TEXTAREA'));
      target.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
      target.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
      await delay(100);
      await target.loadURL(url + '?other=1');
      await delay(250);
      assert.equal(
        await run(`document.body.textContent.includes('元素备注验收')`),
        false,
        'Different page isolates annotations',
      );
      await target.loadURL(url);
      await delay(300);
      await run(
        `document.querySelector('.annotation-panel-resize-handle').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))`,
      );
      await wait(() =>
        run(`document.querySelector('aside.comment-panel')?.textContent.includes('元素备注验收')`),
      );
      await screenshot('replayed-preview.png');
      console.log(
        'PASS fresh capture, inline Enter and click submission, automatic preview visibility, editing, scrolling, route isolation and saved replay',
      );
      console.log('Evidence: ' + output);
      clearTimeout(timeout);
      server.close();
      app.quit();
    } catch (error) {
      console.error(error);
      writeFileSync(join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG());
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
