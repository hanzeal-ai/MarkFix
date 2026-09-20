import { Buffer } from 'node:buffer';
import { BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';

// WebContentsView is a separate surface: capture both live surfaces at their actual bounds.
export async function captureMarketingFrame(win, target, output) {
  const shell = await win.webContents.capturePage();
  const page = await target.capturePage();
  const view = win.contentView.children.find((child) => child.webContents === target);
  if (!view) throw new Error('Visible target view is required');
  const bounds = view.getBounds();
  const [width, height] = win.getContentSize();
  const renderer = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  try {
    await renderer.loadURL('about:blank');
    const data = await renderer.webContents.executeJavaScript(`(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = ${width}; canvas.height = ${height};
      const context = canvas.getContext('2d');
      const load = async (src) => { const img = new Image(); img.src = src; await img.decode(); return img; };
      context.drawImage(await load(${JSON.stringify(shell.toDataURL())}), 0, 0, ${width}, ${height});
      context.drawImage(await load(${JSON.stringify(page.toDataURL())}), ${bounds.x}, ${bounds.y}, ${bounds.width}, ${bounds.height});
      return canvas.toDataURL('image/png').split(',')[1];
    })()`);
    writeFileSync(output, Buffer.from(data, 'base64'));
  } finally {
    renderer.destroy();
  }
}
