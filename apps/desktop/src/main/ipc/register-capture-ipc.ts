import {
  inlineNoteSchema,
  inlineNoteActionSchema,
  elementReselectSchema,
} from '../../inline-note.js';
import { writeFile } from 'node:fs/promises';
import {
  clipboard,
  ClipboardItem,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContentsView,
} from 'electron';
import {
  anchorSchema,
  captureRequestSchema,
  ipcChannels,
  regionAnchorSchema,
  screenshotMarkSchema,
  screenshotStyleSchema,
  screenshotToolSchema,
} from '@markfix/contracts';
import type { CaptureService } from '../capture-service.js';
import { captureClipboardRepresentations } from '../capture-clipboard.js';
import { decodeScreenshotDataUrl, safeScreenshotFilename } from '../image-export.js';

export const registerCaptureIpc = ({
  assertSender,
  captureService,
  mainWindow,
  sendShell,
  websiteView,
  reselectElement,
}: {
  reselectElement: (x: number, y: number) => void;
  assertSender: (event: IpcMainInvokeEvent) => void;
  captureService: () => CaptureService | undefined;
  mainWindow: () => BrowserWindow | undefined;
  sendShell: (channel: string, payload: unknown) => void;
  websiteView: () => WebContentsView | undefined;
}): void => {
  ipcMain.on('markfix:reselect-element', (event, input: unknown) => {
    const view = websiteView();
    if (
      !view ||
      event.sender.id !== view.webContents.id ||
      event.senderFrame !== view.webContents.mainFrame
    )
      return;
    const parsed = elementReselectSchema.safeParse(input);
    if (!parsed.success || parsed.data.documentUrl !== view.webContents.getURL()) return;
    reselectElement(parsed.data.x, parsed.data.y);
  });
  ipcMain.handle('annotation:sync-inline-note', (event, input: unknown) => {
    assertSender(event);
    websiteView()?.webContents.send(
      'markfix:inline-note',
      input === null ? null : inlineNoteSchema.parse(input),
    );
  });
  ipcMain.on('markfix:inline-note-action', (event, input: unknown) => {
    const view = websiteView();
    if (
      !view ||
      event.sender.id !== view.webContents.id ||
      event.senderFrame !== view.webContents.mainFrame
    )
      return;
    const parsed = inlineNoteActionSchema.safeParse(input);
    if (!parsed.success || parsed.data.documentUrl !== view.webContents.getURL()) return;
    sendShell('annotation:inline-note-action', parsed.data);
  });
  ipcMain.handle(ipcChannels.setCaptureTool, (event, input: unknown) => {
    assertSender(event);
    websiteView()?.webContents.send('markfix:set-capture-tool', screenshotToolSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.setCaptureStyle, (event, input: unknown) => {
    assertSender(event);
    websiteView()?.webContents.send(
      'markfix:set-capture-style',
      screenshotStyleSchema.parse(input),
    );
  });
  ipcMain.handle(ipcChannels.syncCaptureMarks, (event, input: unknown) => {
    assertSender(event);
    websiteView()?.webContents.send(
      'markfix:sync-capture-marks',
      screenshotMarkSchema.array().max(500).parse(input),
    );
  });
  ipcMain.handle(ipcChannels.clearCaptureSelection, (event) => {
    assertSender(event);
    websiteView()?.webContents.send('markfix:clear-capture-selection');
  });
  ipcMain.handle(ipcChannels.restoreCaptureSelection, (event, input: unknown) => {
    assertSender(event);
    const payload = input as { selection?: unknown; marks?: unknown };
    websiteView()?.webContents.send('markfix:restore-capture-selection', {
      selection: regionAnchorSchema.parse(payload.selection),
      marks: screenshotMarkSchema.array().max(500).parse(payload.marks),
    });
  });
  ipcMain.handle(ipcChannels.copyCaptureImage, async (event, input: unknown) => {
    assertSender(event);
    const payload = input as { dataUrl?: unknown; note?: unknown };
    const dataUrl = typeof payload.dataUrl === 'string' ? payload.dataUrl : '';
    const image = decodeScreenshotDataUrl(dataUrl);
    const note = typeof payload.note === 'string' ? payload.note : '';
    await clipboard.write(
      captureClipboardRepresentations(new Uint8Array(image), note).map(
        (representations) => new ClipboardItem(representations),
      ),
    );
  });
  ipcMain.handle(ipcChannels.saveCaptureImage, async (event, input: unknown) => {
    assertSender(event);
    const parent = mainWindow();
    if (!parent) throw new Error('Desktop window is unavailable');
    const payload = input as { dataUrl?: unknown; suggestedName?: unknown };
    const image = decodeScreenshotDataUrl(payload.dataUrl);
    const result = await dialog.showSaveDialog(parent, {
      title: '保存 MarkFix 截图',
      defaultPath: safeScreenshotFilename(payload.suggestedName),
      filters: [{ name: 'PNG image', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await writeFile(result.filePath, image);
    return { canceled: false, filePath: result.filePath };
  });
  ipcMain.handle(ipcChannels.capture, async (event, input: unknown) => {
    assertSender(event);
    const service = captureService();
    if (!service) throw new Error('Capture service is unavailable');
    return service.capture(captureRequestSchema.parse(input));
  });
  ipcMain.on('markfix:capture-selection', (event, input: unknown) => {
    if (event.sender.id !== websiteView()?.webContents.id) return;
    if (input === null) {
      sendShell(ipcChannels.captureSelection, null);
      return;
    }
    const parsed = anchorSchema.safeParse(input);
    if (!parsed.success || parsed.data.kind !== 'region') return;
    sendShell(ipcChannels.captureSelection, parsed.data);
  });
  ipcMain.on('markfix:capture-marks-changed', (event, input: unknown) => {
    if (event.sender.id !== websiteView()?.webContents.id) return;
    const parsed = screenshotMarkSchema.array().max(500).safeParse(input);
    if (parsed.success) sendShell(ipcChannels.captureMarksChanged, parsed.data);
  });
  ipcMain.on('markfix:capture-action', (event, input: unknown) => {
    if (event.sender.id !== websiteView()?.webContents.id) return;
    if (['copy', 'save'].includes(String(input))) sendShell(ipcChannels.captureAction, input);
  });
};
