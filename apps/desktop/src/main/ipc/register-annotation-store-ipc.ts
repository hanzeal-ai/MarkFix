import { ipcMain, type IpcMainInvokeEvent, type WebContentsView } from 'electron';
import {
  annotationSubmissionSchema,
  ipcChannels,
  savedCaptureSchema,
  savedDiagnosticAnnotationSchema,
  savedElementCommentSchema,
  type SavedElementComment,
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
  elementComments: () => SavedElementComment[];
  setElementComments: (comments: SavedElementComment[]) => void;
  sendShell: (channel: string, payload: unknown) => void;
};

export const registerAnnotationStoreIpc = (dependencies: Dependencies): void => {
  const router = dependencies.dataRouter;
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
    const capture = savedCaptureSchema.parse(input);
    decodeScreenshotDataUrl(capture.dataUrl);
    await router().saveCapture(capture);
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
    await router().saveElementComment(savedElementCommentSchema.parse(input));
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
  ipcMain.handle(ipcChannels.syncElementComments, (event, input: unknown) => {
    dependencies.assertSender(event);
    const comments = savedElementCommentSchema.array().max(500).parse(input);
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
