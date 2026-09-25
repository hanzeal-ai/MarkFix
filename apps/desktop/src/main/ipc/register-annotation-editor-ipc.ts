import {
  app,
  dialog,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
  type WebContentsView,
} from 'electron';
import { join } from 'node:path';
import {
  annotationSaveFeedbackChannel,
  annotationSaveFeedbackSchema,
  annotationSaveMessages,
} from '../../annotation-save-feedback';
import { inlineNoteSchema, inlineNoteActionSchema, elementReselectSchema } from '../../inline-note';
import { logAnnotationSave } from '../annotation-save-log';

export function registerAnnotationEditorIpc({
  assertSender,
  mainWindow,
  sendShell,
  websiteView,
  reselectElement,
}: {
  assertSender: (event: IpcMainInvokeEvent) => void;
  mainWindow: () => BrowserWindow | undefined;
  sendShell: (channel: string, payload: unknown) => void;
  websiteView: () => WebContentsView | undefined;
  reselectElement: (x: number, y: number) => void;
}): void {
  let showingSaveError = false;
  const feedback = async (code: unknown): Promise<void> => {
    const parsed = annotationSaveFeedbackSchema.parse(code);
    logAnnotationSave(parsed);
    if (!(parsed in annotationSaveMessages) || showingSaveError) return;
    const parent = mainWindow();
    if (!parent || parent.isDestroyed()) return;
    showingSaveError = true;
    try {
      await dialog.showMessageBox(parent, {
        type: 'warning',
        title: '标注保存',
        message: annotationSaveMessages[parsed as keyof typeof annotationSaveMessages],
        detail: `日志位置：${join(app.getPath('logs'), 'annotation-save.log')}`,
        buttons: ['知道了'],
      });
    } finally {
      showingSaveError = false;
    }
  };
  ipcMain.handle(annotationSaveFeedbackChannel, async (event, input: unknown) => {
    assertSender(event);
    await feedback(input);
  });
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
    if (!parsed.success) {
      logAnnotationSave('inline-invalid');
      return;
    }
    if (parsed.data.documentUrl !== view.webContents.getURL()) {
      if (parsed.data.action === 'submit') void feedback('stale-page').catch(() => undefined);
      return;
    }
    if (parsed.data.action === 'submit') logAnnotationSave('inline-submit');
    sendShell('annotation:inline-note-action', parsed.data);
  });
}
