import { useCallback, useEffect, useRef, useState } from 'react';
import {
  anchorSchema,
  screenshotMarkSchema,
  type DiagnosticEvidence,
  type SavedCapture,
  type ScreenshotMark,
} from '@markfix/contracts';
import { composeCaptureExport, composeScreenshot } from '../screenshot-compositor';
import type { CaptureSelection, CaptureSource } from './model';

type CaptureEditorOptions = {
  pageSessionId: string | undefined;
  pageTitle: string;
  projectId: string | undefined;
  setNotice: (message: string | undefined) => void;
};

export function useCaptureEditor({
  pageSessionId,
  pageTitle,
  projectId,
  setNotice,
}: CaptureEditorOptions) {
  const [screenshot, setScreenshot] = useState<string>();
  const [captureSelection, setCaptureSelection] = useState<CaptureSelection>();
  const [captureSource, setCaptureSource] = useState<CaptureSource>();
  const [captureMarks, setCaptureMarks] = useState<ScreenshotMark[]>([]);
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureRendering, setCaptureRendering] = useState(false);
  const [captureNote, setCaptureNote] = useState('');
  const [captureEvidence, setCaptureEvidence] = useState<DiagnosticEvidence[]>([]);
  const [savedCaptures, setSavedCaptures] = useState<SavedCapture[]>([]);
  const [editingCaptureId, setEditingCaptureId] = useState<string>();
  const captureRequestIdRef = useRef<string | undefined>(undefined);
  const captureRestoreRef = useRef<
    | {
        capture: SavedCapture;
        selection: CaptureSelection;
        marks: ScreenshotMark[];
      }
    | undefined
  >(undefined);
  const screenshotRef = useRef<string | undefined>(undefined);
  const captureNoteRef = useRef('');
  const captureSelectionRef = useRef<CaptureSelection | undefined>(undefined);
  const captureMarksRef = useRef<ScreenshotMark[]>([]);
  const activeRestoreRequestRef = useRef<string | undefined>(undefined);
  const savedCapturesRef = useRef<SavedCapture[]>([]);

  useEffect(() => {
    screenshotRef.current = screenshot;
  }, [screenshot]);

  useEffect(() => {
    captureNoteRef.current = captureNote;
  }, [captureNote]);

  useEffect(() => {
    captureSelectionRef.current = captureSelection;
  }, [captureSelection]);

  useEffect(() => {
    captureMarksRef.current = captureMarks;
  }, [captureMarks]);

  useEffect(() => {
    savedCapturesRef.current = savedCaptures;
  }, [savedCaptures]);

  useEffect(() => {
    let active = true;
    setSavedCaptures([]);
    if (!projectId) return () => undefined;
    void window.markfix
      .listCaptureRecords(projectId)
      .then((captures) => active && setSavedCaptures(captures))
      .catch((error: unknown) => {
        if (active) setNotice(error instanceof Error ? error.message : '无法读取本机截图批注。');
      });
    return () => {
      active = false;
    };
  }, [projectId, setNotice]);

  useEffect(() => {
    void window.markfix.syncCaptureMarks(captureMarks);
  }, [captureMarks]);

  useEffect(() => {
    if (!captureSelection || !captureSource) return;
    let active = true;
    setCaptureRendering(true);
    void composeScreenshot(
      captureSource.dataUrl,
      captureMarks,
      captureSelection,
      captureSource.captureScale,
    )
      .then((dataUrl) => active && setScreenshot(dataUrl))
      .catch((error: unknown) => {
        if (active)
          setNotice(error instanceof Error ? error.message : 'Could not render screenshot marks.');
      })
      .finally(() => active && setCaptureRendering(false));
    return () => {
      active = false;
    };
  }, [captureMarks, captureSelection, captureSource, setNotice]);

  useEffect(() => {
    const cleanups = [
      window.markfix.onCaptureSelection((payload) => {
        if (payload === null) {
          captureRequestIdRef.current = undefined;
          captureRestoreRef.current = undefined;
          setCaptureSelection(undefined);
          setCaptureSource(undefined);
          setScreenshot(undefined);
          setCaptureEvidence([]);
          return;
        }
        const parsed = anchorSchema.safeParse(payload);
        if (!parsed.success || parsed.data.kind !== 'region') return;
        if (activeRestoreRequestRef.current) {
          activeRestoreRequestRef.current = undefined;
          setCaptureSelection(parsed.data);
          setCaptureLoading(false);
          return;
        }
        const restore = captureRestoreRef.current;
        if (restore) {
          captureRestoreRef.current = undefined;
          setCaptureSelection(parsed.data);
          setCaptureMarks(restore.marks);
          setCaptureNote(restore.capture.note);
          setCaptureEvidence(restore.capture.evidence ?? []);
          setCaptureSource({
            dataUrl: restore.capture.sourceDataUrl,
            captureScale: restore.capture.captureScale,
            ...(restore.capture.page ? { page: restore.capture.page } : {}),
            ...(restore.capture.capture ? { capture: restore.capture.capture } : {}),
          });
          setScreenshot(restore.capture.dataUrl);
          setCaptureLoading(false);
          return;
        }
        setCaptureSelection(parsed.data);
        setCaptureEvidence([]);
        setCaptureLoading(true);
        setCaptureSource(undefined);
        setScreenshot(undefined);
        const requestId = crypto.randomUUID();
        captureRequestIdRef.current = requestId;
        void window.markfix
          .capture({ mode: 'region', anchor: parsed.data })
          .then((result) => {
            if (captureRequestIdRef.current !== requestId) return;
            setCaptureSource({
              dataUrl: result.dataUrl,
              captureScale: result.captureScale,
              page: {
                url: result.pageUrl,
                title: result.pageTitle,
                viewportWidthCssPx: result.viewportWidthCssPx,
                viewportHeightCssPx: result.viewportHeightCssPx,
                deviceScaleFactor: result.deviceScaleFactor,
                capturedAt: new Date().toISOString(),
              },
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
            });
            setScreenshot(result.dataUrl);
            if (result.warning) setNotice(result.warning);
          })
          .catch((error: unknown) => {
            if (captureRequestIdRef.current !== requestId) return;
            setNotice(error instanceof Error ? error.message : 'Could not capture this selection.');
          })
          .finally(() => {
            if (captureRequestIdRef.current === requestId) setCaptureLoading(false);
          });
      }),
      window.markfix.onCaptureMarksChanged((payload) => {
        const parsed = screenshotMarkSchema.array().max(500).safeParse(payload);
        if (parsed.success) setCaptureMarks(parsed.data);
      }),
      window.markfix.onCaptureAction((payload) => {
        const dataUrl = screenshotRef.current;
        if (!dataUrl) return;
        if (payload === 'copy') void copyCapture(dataUrl);
        if (payload === 'save') void saveCapture(dataUrl);
      }),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [setNotice]);

  const resetLocal = useCallback((): void => {
    captureRequestIdRef.current = undefined;
    captureRestoreRef.current = undefined;
    setCaptureSelection(undefined);
    setCaptureSource(undefined);
    setCaptureMarks([]);
    setCaptureNote('');
    setCaptureEvidence([]);
    setEditingCaptureId(undefined);
    setScreenshot(undefined);
  }, []);

  const beginCaptureMode = useCallback((): void => {
    resetLocal();
    void window.markfix.setCaptureTool('select');
  }, [resetLocal]);

  const restoreActiveCapture = useCallback(async (): Promise<void> => {
    const selection = captureSelectionRef.current;
    if (!selection) return;
    const requestId = crypto.randomUUID();
    activeRestoreRequestRef.current = requestId;
    try {
      await window.markfix.restoreCaptureSelection(selection, captureMarksRef.current);
      window.setTimeout(() => {
        if (activeRestoreRequestRef.current === requestId)
          activeRestoreRequestRef.current = undefined;
      }, 1000);
    } catch (error) {
      if (activeRestoreRequestRef.current === requestId)
        activeRestoreRequestRef.current = undefined;
      throw error;
    }
  }, []);

  const updateCaptureText = (id: string, text: string): void => {
    setCaptureMarks((marks) =>
      marks.map((mark) => (mark.id === id && mark.type === 'text' ? { ...mark, text } : mark)),
    );
  };

  const copyCapture = async (
    dataUrl = screenshot,
    note = captureNoteRef.current,
  ): Promise<boolean> => {
    if (!dataUrl) return false;
    try {
      await window.markfix.copyCaptureImage(await composeCaptureExport(dataUrl, note), note);
      return true;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法复制截图。');
      return false;
    }
  };

  const saveCapture = async (
    dataUrl = screenshot,
    note = captureNoteRef.current,
  ): Promise<void> => {
    if (!dataUrl) return;
    try {
      const result = await window.markfix.saveCaptureImage(
        await composeCaptureExport(dataUrl, note),
        `markfix-${new Date().toISOString().slice(0, 19)}`,
      );
      if (!result.canceled) setNotice(`截图已保存到 ${result.filePath ?? '本地文件'}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法保存截图。');
    }
  };

  const completeCapture = async (): Promise<boolean> => {
    if (
      !captureSelection ||
      !screenshot ||
      !captureSource ||
      !captureNote.trim() ||
      captureRendering ||
      !projectId ||
      !pageSessionId
    )
      return false;
    const existing = savedCaptures.find(({ id }) => id === editingCaptureId);
    const now = new Date().toISOString();
    const capture: SavedCapture = {
      id: existing?.id ?? crypto.randomUUID(),
      projectId,
      pageSessionId,
      pageUrl: captureSelection.documentUrl,
      pageTitle: pageTitle || captureSelection.documentUrl,
      note: captureNote.trim(),
      status: 'draft',
      dataUrl: screenshot,
      widthCssPx: captureSelection.widthCssPx,
      heightCssPx: captureSelection.heightCssPx,
      marks: captureMarks,
      ...(captureEvidence.length > 0 ? { evidence: captureEvidence } : {}),
      selection: captureSelection,
      sourceDataUrl: captureSource.dataUrl,
      captureScale: captureSource.captureScale,
      ...(captureSource.page ? { page: captureSource.page } : {}),
      ...(captureSource.capture ? { capture: captureSource.capture } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await window.markfix.saveCaptureRecord(capture);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法保存截图批注。');
      return false;
    }
    setSavedCaptures((captures) =>
      captures.some(({ id }) => id === capture.id)
        ? captures.map((item) => (item.id === capture.id ? capture : item))
        : [...captures, capture],
    );
    setCaptureNote('');
    setCaptureEvidence([]);
    setCaptureMarks([]);
    setEditingCaptureId(undefined);
    try {
      await window.markfix.clearCaptureSelection();
      await window.markfix.setCaptureTool('select');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '截图批注已保存，但截图工具未能重置。');
    }
    return true;
  };

  const cancelCapture = async (): Promise<void> => {
    setCaptureNote('');
    setCaptureEvidence([]);
    setCaptureMarks([]);
    setEditingCaptureId(undefined);
    await window.markfix.clearCaptureSelection();
    await window.markfix.setCaptureTool('select');
  };

  const deleteSavedCapture = async (id: string): Promise<void> => {
    await window.markfix.deleteCaptureRecord(id);
    setSavedCaptures((captures) => captures.filter((capture) => capture.id !== id));
    if (editingCaptureId === id) await cancelCapture();
    setNotice('截图批注已删除。');
  };

  const selectSavedCapture = async (capture: SavedCapture): Promise<void> => {
    captureRestoreRef.current = {
      capture,
      selection: capture.selection,
      marks: capture.marks,
    };
    setEditingCaptureId(capture.id);
    setCaptureNote(capture.note);
    setCaptureEvidence(capture.evidence ?? []);
    setScreenshot(capture.dataUrl);
    await window.markfix.restoreCaptureSelection(capture.selection, capture.marks);
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('[data-capture-note]')?.focus();
    });
  };

  const markSubmitted = useCallback((ids: string[], submittedAt: string): void => {
    setSavedCaptures((captures) =>
      captures.map((capture) =>
        ids.includes(capture.id) ? { ...capture, status: 'submitted', submittedAt } : capture,
      ),
    );
  }, []);

  const resetAfterSubmission = useCallback((): void => {
    resetLocal();
    void window.markfix.clearCaptureSelection();
    void window.markfix.setCaptureTool('select');
  }, [resetLocal]);

  return {
    beginCaptureMode,
    cancelCapture,
    captureEvidence,
    captureLoading,
    captureMarks,
    captureNote,
    captureRendering,
    captureSelection,
    completeCapture,
    copyCapture,
    deleteSavedCapture,
    editingCaptureId,
    markSubmitted,
    resetAfterSubmission,
    restoreActiveCapture,
    saveCapture,
    savedCaptures,
    savedCapturesRef,
    screenshot,
    selectSavedCapture,
    setCaptureEvidence,
    setCaptureNote,
    updateCaptureText,
  };
}
