import type { RefObject } from 'react';
import type { BrowserMode } from '@markfix/contracts';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  LoaderCircle,
  MessageSquareText,
  MoreHorizontal,
  RefreshCw,
  Send,
} from '@markfix/ui/icons';
import { Button, Input, ToggleGroup, ToggleGroupItem } from '@markfix/ui';
import type { BrowserState } from './model';

type BrowserToolbarProps = {
  addressInputRef: RefObject<HTMLInputElement | null>;
  browserState: BrowserState;
  diagnosticErrorCount: number;
  isSubmitting: boolean;
  mode: BrowserMode;
  unsubmittedCount: number;
  url: string;
  onError: (message: string) => void;
  onOpenReview: () => void;
  onToggleMode: (mode: 'comment' | 'capture') => void;
  onUrlChange: (url: string) => void;
};

export function BrowserToolbar({
  addressInputRef,
  browserState,
  diagnosticErrorCount,
  isSubmitting,
  mode,
  unsubmittedCount,
  url,
  onError,
  onOpenReview,
  onToggleMode,
  onUrlChange,
}: BrowserToolbarProps) {
  return (
    <>
      <div className="prototype-browser-bar">
        <div className="nav-buttons">
          <Button
            aria-label="后退"
            title="后退"
            disabled={!browserState.canGoBack}
            onClick={() => void window.markfix.back()}
          >
            <ArrowLeft />
          </Button>
          <Button
            aria-label="前进"
            title="前进"
            disabled={!browserState.canGoForward}
            onClick={() => void window.markfix.forward()}
          >
            <ArrowRight />
          </Button>
          <Button aria-label="刷新" title="刷新" onClick={() => void window.markfix.reload()}>
            <RefreshCw className={browserState.loading ? 'spin' : ''} />
          </Button>
        </div>
        <form
          className="address"
          onSubmit={(event) => {
            event.preventDefault();
            void window.markfix
              .navigate(url)
              .catch((error: unknown) =>
                onError(error instanceof Error ? error.message : 'Invalid URL'),
              );
          }}
        >
          <span className="secure-dot" />
          <Input
            ref={addressInputRef}
            value={url}
            aria-label="网站地址"
            aria-keyshortcuts="Meta+L"
            spellCheck={false}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              event.stopPropagation();
              onUrlChange(browserState.url ?? '');
              event.currentTarget.blur();
            }}
            onChange={(event) => onUrlChange(event.target.value)}
          />
        </form>
      </div>
      <div className="tools">
        <ToggleGroup
          className="annotation-mode-control"
          type="single"
          value={mode === 'comment' || mode === 'capture' ? mode : ''}
          aria-label="标注工具"
          onValueChange={(value) => {
            if (value === 'comment' || value === 'capture') onToggleMode(value);
            else if (mode === 'comment' || mode === 'capture') onToggleMode(mode);
          }}
        >
          <ToggleGroupItem value="comment" aria-keyshortcuts="Alt+W" title="批注（⌥W）">
            <MessageSquareText /> 批注 <kbd>⌥W</kbd>
          </ToggleGroupItem>
          <ToggleGroupItem value="capture" aria-keyshortcuts="Alt+A" title="截图（⌥A）">
            <Camera /> 截图 <kbd>⌥A</kbd>
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          className="more-menu-trigger diagnostics-button"
          aria-label="更多"
          title="更多"
          aria-haspopup="menu"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            void window.markfix
              .openMoreMenu(rect.left, rect.bottom)
              .catch((error: unknown) =>
                onError(error instanceof Error ? error.message : '无法打开更多菜单。'),
              );
          }}
        >
          <MoreHorizontal />
          {diagnosticErrorCount > 0 && <i>{Math.min(99, diagnosticErrorCount)}</i>}
        </Button>
        <Button
          className="save-annotations-button"
          disabled={unsubmittedCount === 0 || isSubmitting}
          onClick={onOpenReview}
        >
          {isSubmitting ? <LoaderCircle className="spin" /> : <Send />}
          提交标注{unsubmittedCount > 0 ? ` ${unsubmittedCount}` : ''}
        </Button>
      </div>
    </>
  );
}
