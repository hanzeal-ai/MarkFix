import { app, BrowserWindow, safeStorage } from 'electron';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import assert from 'node:assert/strict';
import { setTimeout, clearTimeout } from 'node:timers';
const profile = mkdtempSync(join(tmpdir(), 'markfix-account-approval-'));
app.setPath('userData', profile);
process.env.MARKFIX_LOCAL_AGENT_FILE = join(profile, 'agent.json');
// Only this disposable test account/profile bypasses the OS vault; real API and IPC are exercised.
safeStorage.isEncryptionAvailable = () => true;
safeStorage.encryptString = (value) => Buffer.from(value);
safeStorage.decryptString = (value) => value.toString();
process.env.MARKFIX_SERVICE_ORIGIN = process.env.MARKFIX_TEST_API;
assert(
  process.env.MARKFIX_TEST_API && process.env.MARKFIX_TEST_EMAIL && process.env.MARKFIX_TEST_CODE,
);
const timeout = setTimeout(() => {
  console.error('Desktop authorization smoke timed out');
  BrowserWindow.getAllWindows().forEach((window) => window.destroy());
  app.exit(1);
}, 55000);
const helpers = `window.qa={wait:async(fn)=>{const end=Date.now()+10000;while(!fn()){if(Date.now()>end)throw Error('Timed out: '+fn+' '+document.body.innerText);await new Promise(r=>setTimeout(r,50));}},button:name=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===name),fill:(el,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v);el.dispatchEvent(new Event('input',{bubbles:true}));}};`;
let started = false;
app.on('browser-window-created', (_event, win) => {
  if (started) return;
  started = true;
  win.webContents.once('did-finish-load', async () => {
    let settings;
    try {
      const run = (code) => win.webContents.executeJavaScript(code);
      await run(helpers + `qa.wait(()=>document.querySelector('input[type="email"]'))`);
      await run(
        `qa.fill(document.querySelector('input[type="email"]'),${JSON.stringify(process.env.MARKFIX_TEST_EMAIL)});qa.fill(document.querySelector('input[type="password"]'),${JSON.stringify(process.env.MARKFIX_TEST_PASSWORD)});`,
      );
      await run(
        `document.querySelector('form button[type="submit"]').click();qa.wait(()=>document.body.innerText.includes('修复授权申请待处理'))`,
      );
      await run(`qa.button('打开设置').click()`);
      await new Promise((resolvePromise, reject) => {
        const end = Date.now() + 10000;
        const poll = () => {
          settings = BrowserWindow.getAllWindows().find(
            (item) => item !== win && item.webContents.getURL().includes('view=settings'),
          );
          if (settings && !settings.webContents.isLoading()) resolvePromise();
          else if (Date.now() > end) reject(new Error('Settings window missing'));
          else setTimeout(poll, 50);
        };
        poll();
      });
      const ui = (code) => settings.webContents.executeJavaScript(code);
      await ui(helpers + `qa.wait(()=>qa.button('修复授权'))`);
      settings.show();
      settings.focus();
      settings.webContents.focus();
      const point = await ui(
        `(()=>{const rect=qa.button('修复授权').getBoundingClientRect();return {x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}})()`,
      );
      settings.webContents.sendInputEvent({
        type: 'mouseDown',
        button: 'left',
        clickCount: 1,
        ...point,
      });
      settings.webContents.sendInputEvent({
        type: 'mouseUp',
        button: 'left',
        clickCount: 1,
        ...point,
      });
      await ui(
        `qa.wait(()=>document.body.innerText.includes(${JSON.stringify(process.env.MARKFIX_TEST_CODE)}))`,
      );
      assert.equal(
        await ui(`qa.button('授权所选项目').disabled`),
        true,
        'no projects are selected by default',
      );
      assert.equal(
        await ui(
          `document.body.innerText.includes(${JSON.stringify(process.env.MARKFIX_TEST_EMAIL)})`,
        ),
        true,
      );
      await ui(
        `[...document.querySelectorAll('.settings-agent-card label')].find(label=>label.textContent.includes('Agent flow')).querySelector('[role="checkbox"]').click()`,
      );
      assert.equal(await ui(`qa.button('授权所选项目').disabled`), false);
      writeFileSync(
        join(process.env.MARKFIX_TEST_OUTPUT, 'desktop-account-approval.png'),
        (await settings.webContents.capturePage()).toPNG(),
      );
      await ui(
        `qa.button('授权所选项目').click();qa.wait(()=>document.body.innerText.includes('已授权设备') && qa.button('撤销授权'))`,
      );
      console.log(
        'PASS real desktop login → pending notification → settings → explicit project selection → owner approval; CLI may continue. Evidence: ' +
          process.env.MARKFIX_TEST_OUTPUT,
      );
      clearTimeout(timeout);
      BrowserWindow.getAllWindows().forEach((window) => window.destroy());
      app.exit(0);
    } catch (error) {
      console.error(error);
      writeFileSync(
        join(process.env.MARKFIX_TEST_OUTPUT, 'desktop-account-approval-failure.png'),
        (await (settings ?? win).webContents.capturePage()).toPNG(),
      );
      clearTimeout(timeout);
      BrowserWindow.getAllWindows().forEach((window) => window.destroy());
      app.exit(1);
    }
  });
});
await import(resolve(import.meta.dirname, '../out/main/index.js'));
