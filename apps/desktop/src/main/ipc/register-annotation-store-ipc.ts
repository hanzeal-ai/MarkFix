import { logAnnotationSave } from '../annotation-save-log';
import {
  capturePinSchema,
  elementCommentPinSchema,
  type CapturePin,
  type ElementCommentPin,
} from '../../capture-pin';
import { ipcMain, type IpcMainInvokeEvent, type WebContentsView } from 'electron';
import {
  annotationSubmissionSchema,
  ipcChannels,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  type WebsiteProject,
} from '@markfix/contracts';
import type { ProjectDataRouter } from '../project-data-router.js';
import { decodeScreenshotDataUrl } from '../image-export.js';

type Dependencies = {
  assertSender: (event: IpcMainInvokeEvent) => void;
  dataRouter: () => ProjectDataRouter;
  projects: () => WebsiteProject[];
  activeProjectId: () => string | undefined;
  websiteView: () => WebContentsView | undefined;
  elementComments: () => ElementCommentPin[];
  capturePins: () => CapturePin[];
  setCapturePins: (pins: CapturePin[]) => void;
  setElementComments: (comments: ElementCommentPin[]) => void;
  sendShell: (channel: string, payload: unknown) => void;
};

export const registerAnnotationStoreIpc = (dependencies: Dependencies): void => {
  const router = dependencies.dataRouter;
  ipcMain.on('markfix:select-annotation-pin', (event, input: unknown) => {
    const view = dependencies.websiteView();
    if (
      !view ||
      event.sender.id !== view.webContents.id ||
      event.senderFrame !== view.webContents.mainFrame
    )
      return;
    const payload = input as { id?: unknown; type?: unknown; documentUrl?: unknown } | null;
    if (!payload || payload.documentUrl !== view.webContents.getURL()) return;
    if (payload.type !== 'element' && payload.type !== 'capture') return;
    const records =
      payload.type === 'element' ? dependencies.elementComments() : dependencies.capturePins();
    const comment = records.find(
      (item) =>
        item.id === payload.id &&
        item.projectId === dependencies.activeProjectId() &&
        item.pageUrl === payload.documentUrl,
    );
    if (!comment) return;
    dependencies.sendShell(ipcChannels.annotationHistorySelected, {
      type: payload.type,
      projectId: comment.projectId,
      id: comment.id,
    });
  });
  const projectIdForDelete = (): string => {
    const projectId = dependencies.activeProjectId();
    if (!projectId) throw new Error('请先打开一个标注项目');
    return projectId;
  };
  ipcMain.handle(ipcChannels.listCaptureRecords, async (event, input: unknown) => {
    dependencies.assertSender(event);
    if (input !== undefined && typeof input !== 'string') throw new Error('Invalid project ID');
    if (typeof input !== 'string') return [];
    return router().listCaptures(input);
  });
  ipcMain.handle(ipcChannels.listAnnotationHistorySummaries, async (event) => {
    dependencies.assertSender(event);
    return router().listHistorySummaries(dependencies.projects());
  });
  ipcMain.handle(ipcChannels.saveCaptureRecord, async (event, input: unknown) => {
    dependencies.assertSender(event);
    logAnnotationSave('saveCaptureRecord:received');
    try {
      const capture = savedCaptureSchema.parse(input);
      decodeScreenshotDataUrl(capture.dataUrl);
      await router().saveCapture(capture);
      logAnnotationSave('saveCaptureRecord:saved');
    } catch (error) {
      logAnnotationSave('saveCaptureRecord:failed', error);
      throw error;
    }
  });
  ipcMain.handle(ipcChannels.deleteCaptureRecord, async (event, input: unknown) => {
    dependencies.assertSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    await router().deleteCapture(projectIdForDelete(), input);
  });
  ipcMain.handle(ipcChannels.listElementComments, async (event, input: unknown) => {
    dependencies.assertSender(event);
    if (input !== undefined && typeof input !== 'string') throw new Error('Invalid project ID');
    if (typeof input !== 'string') return [];
    return router().listElementComments(input);
  });
  ipcMain.handle(ipcChannels.saveElementComment, async (event, input: unknown) => {
    dependencies.assertSender(event);
    logAnnotationSave('saveElementComment:received');
    try {
      await router().saveElementComment(savedElementCommentSchema.parse(input));
      logAnnotationSave('saveElementComment:saved');
    } catch (error) {
      logAnnotationSave('saveElementComment:failed', error);
      throw error;
    }
  });
  ipcMain.handle(ipcChannels.deleteElementComment, async (event, input: unknown) => {
    dependencies.assertSender(event);
    if (typeof input !== 'string') throw new Error('Invalid element comment ID');
    await router().deleteElementComment(projectIdForDelete(), input);
  });
  ipcMain.handle(ipcChannels.listDiagnosticAnnotations, async (event, input: unknown) => {
    dependencies.assertSender(event);
    if (input !== undefined && typeof input !== 'string') throw new Error('Invalid project ID');
    if (typeof input !== 'string') return [];
    return router().listDiagnostics(input);
  });
  ipcMain.handle(ipcChannels.saveDiagnosticAnnotation, async (event, input: unknown) => {
    dependencies.assertSender(event);
    await router().saveDiagnostic(savedDiagnosticAnnotationSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.deleteDiagnosticAnnotation, async (event, input: unknown) => {
    dependencies.assertSender(event);
    if (typeof input !== 'string') throw new Error('Invalid diagnostic annotation ID');
    await router().deleteDiagnostic(projectIdForDelete(), input);
  });
  ipcMain.handle('annotation:sync-capture-pins', (event, input: unknown) => {
    dependencies.assertSender(event);
    const pins = capturePinSchema.array().max(500).parse(input);
    dependencies.setCapturePins(pins);
    dependencies.websiteView()?.webContents.send('markfix:render-capture-pins', pins);
  });
  ipcMain.handle(ipcChannels.syncElementComments, (event, input: unknown) => {
    dependencies.assertSender(event);
    const comments = elementCommentPinSchema.array().max(500).parse(input);
    dependencies.setElementComments(comments);
    dependencies.websiteView()?.webContents.send('markfix:render-element-comments', comments);
  });
  ipcMain.handle(ipcChannels.saveAnnotationSubmission, async (event, input: unknown) => {
    dependencies.assertSender(event);
    const submission = annotationSubmissionSchema.parse(input);
    for (const capture of submission.captures) decodeScreenshotDataUrl(capture.dataUrl);
    await router().saveSubmission(submission);
    const submittedElementCommentIds = submission.elementComments.map(({ id }) => id);
    const comments = dependencies
      .elementComments()
      .filter(({ id }) => !submittedElementCommentIds.includes(id));
    dependencies.setElementComments(comments);
    dependencies.websiteView()?.webContents.send('markfix:render-element-comments', comments);
    dependencies.sendShell(ipcChannels.annotationSubmissionSaved, {
      elementCommentCount: submission.elementComments.length,
      captureCount: submission.captures.length,
      diagnosticAnnotationCount: submission.diagnostics.length,
      elementCommentIds: submittedElementCommentIds,
      captureIds: submission.captures.map(({ id }) => id),
      diagnosticAnnotationIds: submission.diagnostics.map(({ id }) => id),
      submittedAt: submission.submittedAt,
    });
  });
};
