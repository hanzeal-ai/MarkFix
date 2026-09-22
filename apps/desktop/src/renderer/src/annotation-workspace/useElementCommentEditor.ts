import { useCallback, useEffect, useRef, useState } from 'react';
import {
  anchorSchema,
  type Anchor,
  type BrowserMode,
  type CaptureContext,
  type DiagnosticEvidence,
  type SavedElementComment,
} from '@markfix/contracts';
import { elementCommentScreenshotPreference } from '../desktop-preferences';
import { anchorRecoveryNotice } from './anchor-recovery';
import { elementAnchorsEqual } from './model';
import { rejectedRecordUpdates, type ReportRejection } from '../report-reconciliation';

export function useElementCommentEditor({
  mode,
  pageSessionId,
  pageTitle,
  projectId,
  setNotice,
}: {
  mode: BrowserMode;
  pageSessionId: string | undefined;
  pageTitle: string;
  projectId: string | undefined;
  setNotice: (message: string | undefined) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor>();
  const [elementComments, setElementComments] = useState<SavedElementComment[]>([]);
  const [elementCommentNote, setElementCommentNote] = useState('');
  const [elementEvidence, setElementEvidence] = useState<DiagnosticEvidence[]>([]);
  const [editingElementCommentId, setEditingElementCommentId] = useState<string>();
  const captureRequestIdRef = useRef<string | undefined>(undefined);
  const elementCaptureRef = useRef<
    { screenshotDataUrl: string; capture: CaptureContext } | undefined
  >(undefined);
  const elementCapturePromiseRef = useRef<Promise<void> | undefined>(undefined);
  const elementCommentsRef = useRef<SavedElementComment[]>([]);
  const projectIdRef = useRef<string | undefined>(undefined);
  elementCommentsRef.current = elementComments;
  projectIdRef.current = projectId;

  useEffect(() => {
    let active = true;
    setElementComments([]);
    if (!projectId) return () => undefined;
    void window.markfix
      .listElementComments(projectId)
      .then((comments) => active && setElementComments(comments))
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : '无法读取本机元素批注。');
      });
    return () => {
      active = false;
    };
  }, [projectId, setNotice]);

  useEffect(() => {
    void window.markfix.syncAnchor(mode === 'comment' ? (anchor ?? null) : null);
  }, [anchor, mode]);

  useEffect(() => {
    const cleanups = [
      window.markfix.onSelection((payload) => {
        const parsed = anchorSchema.safeParse(payload);
        if (!parsed.success || parsed.data.kind !== 'element') return;
        const nextAnchor = parsed.data;
        const existing = elementCommentsRef.current.find(
          ({ projectId: savedProjectId, anchor: savedAnchor }) =>
            savedProjectId === projectIdRef.current && elementAnchorsEqual(savedAnchor, nextAnchor),
        );
        setAnchor(nextAnchor);
        setEditingElementCommentId(existing?.id);
        setElementCommentNote(existing?.note ?? '');
        setElementEvidence(existing?.evidence ?? []);
        elementCaptureRef.current =
          existing?.screenshotDataUrl && existing.capture
            ? { screenshotDataUrl: existing.screenshotDataUrl, capture: existing.capture }
            : undefined;
        elementCapturePromiseRef.current = undefined;
        const captureRequestId = crypto.randomUUID();
        captureRequestIdRef.current = captureRequestId;
        if (!existing && elementCommentScreenshotPreference(window.localStorage)) {
          elementCapturePromiseRef.current = window.markfix
            .capture({ mode: 'element', anchor: nextAnchor })
            .then((result) => {
              if (captureRequestIdRef.current !== captureRequestId) return;
              elementCaptureRef.current = {
                screenshotDataUrl: result.dataUrl,
                capture: {
                  mode: result.mode,
                  imageWidthPx: result.imageWidthPx,
                  imageHeightPx: result.imageHeightPx,
                  widthCssPx: result.widthCssPx,
                  heightCssPx: result.heightCssPx,
                  originCssPx: result.originCssPx,
                  captureScale: result.captureScale,
                  truncated: result.truncated,
                  ...(result.warning ? { warning: result.warning } : {}),
                },
              };
            })
            .catch(() => undefined);
        }
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>('[data-element-comment-note]')?.focus();
        });
      }),
      window.markfix.onAnchorRecovery((payload) => {
        const recovery = payload as {
          status?: unknown;
          anchor?: unknown;
        };
        const recoveryNotice = anchorRecoveryNotice(recovery.status);
        if (recoveryNotice) {
          setNotice(recoveryNotice);
          return;
        }
        const parsed = anchorSchema.safeParse(recovery.anchor);
        if (!parsed.success || parsed.data.kind !== 'element') return;
        setAnchor(parsed.data);
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [setNotice]);

  const clearElementSelection = useCallback((): void => {
    captureRequestIdRef.current = undefined;
    elementCapturePromiseRef.current = undefined;
    elementCaptureRef.current = undefined;
    setAnchor(undefined);
    setElementCommentNote('');
    setElementEvidence([]);
    setEditingElementCommentId(undefined);
  }, []);

  const completeElementComment = async (note = elementCommentNote): Promise<boolean> => {
    if (anchor?.kind !== 'element' || !note.trim() || !projectId || !pageSessionId) return false;
    await elementCapturePromiseRef.current;
    const elementCapture = elementCaptureRef.current;
    const now = new Date().toISOString();
    const existing = elementComments.find(
      (comment) =>
        comment.projectId === projectId &&
        (comment.id === editingElementCommentId || elementAnchorsEqual(comment.anchor, anchor)),
    );
    const comment: SavedElementComment = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId,
      pageSessionId,
      pageUrl: anchor.documentUrl,
      pageTitle: pageTitle || anchor.documentUrl,
      anchor,
      note: note.trim(),
      status: 'draft',
      ...(elementEvidence.length > 0 ? { evidence: elementEvidence } : {}),
      ...(elementCapture
        ? {
            screenshotDataUrl: elementCapture.screenshotDataUrl,
            capture: elementCapture.capture,
          }
        : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await window.markfix.saveElementComment(comment);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法保存元素批注。');
      return false;
    }
    setElementComments((comments) =>
      comments.some(({ id }) => id === comment.id)
        ? comments.map((item) => (item.id === comment.id ? comment : item))
        : [...comments, comment],
    );
    clearElementSelection();
    return true;
  };

  const selectElementComment = (comment: SavedElementComment): void => {
    setAnchor(comment.anchor);
    setEditingElementCommentId(comment.id);
    setElementCommentNote(comment.note);
    setElementEvidence(comment.evidence ?? []);
    elementCapturePromiseRef.current = undefined;
    elementCaptureRef.current =
      comment.screenshotDataUrl && comment.capture
        ? { screenshotDataUrl: comment.screenshotDataUrl, capture: comment.capture }
        : undefined;
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-element-comment-note]')?.focus();
    });
  };

  const deleteElementComment = async (id: string): Promise<void> => {
    await window.markfix.deleteElementComment(id);
    setElementComments((comments) => comments.filter((comment) => comment.id !== id));
    if (editingElementCommentId === id) clearElementSelection();
    setNotice('元素批注已删除。');
  };

  const markSubmitted = useCallback((ids: string[], submittedAt: string): void => {
    setElementComments((comments) =>
      comments.map((comment) =>
        ids.includes(comment.id) ? { ...comment, status: 'submitted', submittedAt } : comment,
      ),
    );
  }, []);

  const syncReportRejections = useCallback(
    async (rejections: ReadonlyMap<string, ReportRejection>): Promise<void> => {
      const updates = rejectedRecordUpdates(elementCommentsRef.current, rejections);
      if (updates.length === 0) return;
      try {
        await Promise.all(updates.map((comment) => window.markfix.saveElementComment(comment)));
        const byId = new Map(updates.map((comment) => [comment.id, comment]));
        setElementComments((comments) =>
          comments.map((comment) =>
            comment.status === 'submitted' ? (byId.get(comment.id) ?? comment) : comment,
          ),
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : '无法同步元素批注的驳回状态。');
      }
    },
    [setNotice],
  );

  return {
    anchor,
    clearElementSelection,
    completeElementComment,
    deleteElementComment,
    editingElementCommentId,
    elementCommentNote,
    elementComments,
    elementCommentsRef,
    elementEvidence,
    markSubmitted,
    syncReportRejections,
    selectElementComment,
    setElementCommentNote,
    setElementEvidence,
  };
}
