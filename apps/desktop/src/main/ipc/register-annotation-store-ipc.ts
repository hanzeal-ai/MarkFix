import { ipcMain, type IpcMainInvokeEvent, type WebContentsView } from 'electron';
import {
  annotationSubmissionSchema,
  ipcChannels,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  type SavedElementComment,
} from '@markfix/contracts';
import type { DraftStore } from '../draft-store.js';
import { decodeScreenshotDataUrl } from '../image-export.js';

type Dependencies = {
  assertSender: (event: IpcMainInvokeEvent) => void;
  draftStore: () => DraftStore | undefined;
  websiteView: () => WebContentsView | undefined;
  elementComments: () => SavedElementComment[];
  setElementComments: (comments: SavedElementComment[]) => void;
  sendShell: (channel: string, payload: unknown) => void;
};

export const registerAnnotationStoreIpc = (dependencies: Dependencies): void => {
  const store = dependencies.draftStore;
  ipcMain.handle(ipcChannels.listCaptureRecords, (event, input: unknown) => {
    dependencies.assertSender(event);
    if (input !== undefined && typeof input !== 'string') throw new Error('Invalid project ID');
    return store()?.listCaptures(input) ?? [];
  });
  ipcMain.handle(ipcChannels.listAnnotationHistorySummaries, (event) => {
    dependencies.assertSender(event);
    return store()?.listAnnotationHistorySummaries() ?? [];
  });
  ipcMain.handle(ipcChannels.saveCaptureRecord, (event, input: unknown) => {
    dependencies.assertSender(event);
    const capture = savedCaptureSchema.parse(input);
    decodeScreenshotDataUrl(capture.dataUrl);
    store()?.saveCapture(capture);
  });
  ipcMain.handle(ipcChannels.deleteCaptureRecord, (event, input: unknown) => {
    dependencies.assertSender(event);
    if (typeof input !== 'string') throw new Error('Invalid capture ID');
    store()?.deleteCapture(input);
  });
  ipcMain.handle(ipcChannels.listElementComments, (event, input: unknown) => {
    dependencies.assertSender(event);
    if (input !== undefined && typeof input !== 'string') throw new Error('Invalid project ID');
    return store()?.listElementComments(input) ?? [];
  });
  ipcMain.handle(ipcChannels.saveElementComment, (event, input: unknown) => {
    dependencies.assertSender(event);
    store()?.saveElementComment(savedElementCommentSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.deleteElementComment, (event, input: unknown) => {
    dependencies.assertSender(event);
    if (typeof input !== 'string') throw new Error('Invalid element comment ID');
    store()?.deleteElementComment(input);
  });
  ipcMain.handle(ipcChannels.listDiagnosticAnnotations, (event, input: unknown) => {
    dependencies.assertSender(event);
    if (input !== undefined && typeof input !== 'string') throw new Error('Invalid project ID');
    return store()?.listDiagnosticAnnotations(input) ?? [];
  });
  ipcMain.handle(ipcChannels.saveDiagnosticAnnotation, (event, input: unknown) => {
    dependencies.assertSender(event);
    store()?.saveDiagnosticAnnotation(savedDiagnosticAnnotationSchema.parse(input));
  });
  ipcMain.handle(ipcChannels.deleteDiagnosticAnnotation, (event, input: unknown) => {
    dependencies.assertSender(event);
    if (typeof input !== 'string') throw new Error('Invalid diagnostic annotation ID');
    store()?.deleteDiagnosticAnnotation(input);
  });
  ipcMain.handle(ipcChannels.syncElementComments, (event, input: unknown) => {
    dependencies.assertSender(event);
    const comments = savedElementCommentSchema.array().max(500).parse(input);
    dependencies.setElementComments(comments);
    dependencies.websiteView()?.webContents.send('markfix:render-element-comments', comments);
  });
  ipcMain.handle(ipcChannels.saveAnnotationSubmission, (event, input: unknown) => {
    dependencies.assertSender(event);
    const submission = annotationSubmissionSchema.parse(input);
    for (const capture of submission.captures) decodeScreenshotDataUrl(capture.dataUrl);
    store()?.saveAnnotationSubmission(submission);
    const submittedElementCommentIds = submission.elementComments.map(({ id }) => id);
    const comments = dependencies.elementComments().filter(
      ({ id }) => !submittedElementCommentIds.includes(id),
    );
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
