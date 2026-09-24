import { manualUpdates } from './platform';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  toast,
} from '@markfix/ui';
import { Download, LoaderCircle } from '@markfix/ui/icons';
import { desktopUpdateActive, type DesktopUpdateStatus } from '../../desktop-update';

export function DesktopUpdateButton({
  available,
  beforeStart,
  fallback = null,
}: {
  available: boolean;
  fallback?: ReactNode;
  beforeStart?: () => Promise<void>;
}) {
  const pending = useRef(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState<DesktopUpdateStatus>({ phase: 'idle', message: '' });
  const busy = preparing || desktopUpdateActive(status);

  useEffect(() => {
    let received = false;
    const unsubscribe = window.markfix.onUpdateStatus((next) => {
      received = true;
      setStatus(next);
      if (next.phase === 'error') toast.error(next.message);
      if (next.phase === 'current' || next.phase === 'manual') toast(next.message);
    });
    void window.markfix
      .updateStatus()
      .then((next) => {
        if (!received) setStatus(next);
      })
      .catch(() => undefined);
    return () => {
      received = true;
      unsubscribe();
    };
  }, []);

  async function update() {
    if (pending.current || busy) return;
    pending.current = true;
    setPreparing(true);
    try {
      await beforeStart?.();
      setStatus(await window.markfix.startUpdate());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '无法启动更新，请稍后重试。');
    } finally {
      pending.current = false;
      setPreparing(false);
    }
  }

  if (!busy && (!available || status.phase === 'current')) return fallback;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="desktop-update-button"
        aria-label={busy ? '正在更新' : '更新'}
        title={!manualUpdates ? '下载更新并自动安装重启' : '打开下载页，下载安装新版'}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void update()}
      >
        {busy ? <LoaderCircle className="animate-spin" /> : <Download />}
        <span>更新</span>
      </Button>
      <Dialog open={busy}>
        <DialogContent
          data-desktop-update-active
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>正在更新 MarkFix</DialogTitle>
            <DialogDescription aria-live="polite">
              {preparing ? '正在保存当前批注…' : status.message}
            </DialogDescription>
          </DialogHeader>
          <p>
            {!manualUpdates
              ? '更新完成后将自动重启，无需其他操作。'
              : '将打开下载页，请下载新版并退出 MarkFix 后覆盖安装。'}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
