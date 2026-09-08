/* global process, console, setTimeout, clearTimeout */
// Run after building: pnpm exec electron scripts/check-login-layout.mjs [app.asar]
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { app, BrowserWindow, ipcMain } from 'electron';

const root = process.argv[2] || path.resolve(import.meta.dirname, '..');
const timeout = setTimeout(() => {
  console.error('Login layout check timed out');
  app.exit(1);
}, 15000);

app.whenReady().then(async () => {
  try {
    ipcMain.handle('auth:status', () => ({ authenticated: false }));
    const window = new BrowserWindow({
      width: 1100,
      height: 850,
      show: false,
      webPreferences: { preload: path.join(root, 'out/preload/shell.cjs') },
    });
    await window.loadFile(path.join(root, 'out/renderer/index.html'));
    const result = await window.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const check = () => {
          const button = document.querySelector('.password-toggle');
          if (!button) return requestAnimationFrame(check);
          const input = document.querySelector('.password-field input');
          const inputBox = input.getBoundingClientRect();
          const buttonBox = button.getBoundingClientRect();
          const offset = Math.abs(inputBox.y + inputBox.height / 2 - buttonBox.y - buttonBox.height / 2);
          const inside = buttonBox.x >= inputBox.x && buttonBox.right <= inputBox.right;
          button.click();
          requestAnimationFrame(() => {
            const shown = input.type === 'text' && button.getAttribute('aria-pressed') === 'true';
            button.click();
            requestAnimationFrame(() => resolve({ offset, inside, shown, hidden: input.type === 'password' }));
          });
        };
        check();
      })
    `);
    assert.ok(result.offset <= 1, `Password toggle is offset by ${result.offset}px`);
    assert.ok(result.inside && result.shown && result.hidden, JSON.stringify(result));
    if (process.env.MARKFIX_LAYOUT_SCREENSHOT) {
      writeFileSync(
        process.env.MARKFIX_LAYOUT_SCREENSHOT,
        (await window.webContents.capturePage()).toPNG(),
      );
    }
    console.log('Built login layout and password visibility passed:', result);
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});
