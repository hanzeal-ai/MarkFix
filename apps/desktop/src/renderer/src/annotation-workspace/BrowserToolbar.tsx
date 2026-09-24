import { primaryAriaKey, altKey } from '../platform';
import type { RefObject } from 'react';
import type { BrowserMode } from '@markfix/contracts';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  LoaderCircle,
  MessageSquareText,
  Eye,
  MousePointer2,
  RotateCw,
  Send,
} from '@markfix/ui/icons';
import { Button, Input, Kbd, ToggleGroup, ToggleGroupItem } from '@markfix/ui';
import type { BrowserState } from './model';

type BrowserToolbarProps = {
  addressInputRef: RefObject<HTMLInputElement | null>;
  browserState: BrowserState;
  previewOpen: boolean;
  onTogglePreview: () => void;
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
  previewOpen,
  onTogglePreview,
  isSubmitting,
  mode,
  unsubmittedCount,
  url,
  onError,
  onOpenReview,
  onToggleMode,
  onUrlChange,
}: BrowserToolbarProps) {
  const selectedMode = previewOpen
    ? 'preview'
    : mode === 'comment' || mode === 'capture'
      ? mode
      : '';
  return (
    <>
      <div className="nav-buttons">
        <Button
          aria-label="后退"
          title="后退"
          disabled={!browserState?.canGoBack}
          onClick={() => void window.markfix.back()}
        >
          <ArrowLeft />
        </Button>
        <Button
          aria-label="前进"
          title="前进"
          disabled={!browserState?.canGoForward}
          onClick={() => void window.markfix.forward()}
        >
          <ArrowRight />
        </Button>

        <Button aria-label="刷新" title="刷新" onClick={() => void window.markfix.reload()}>
          <RotateCw className={browserState.loading ? 'spin' : ''} />
        </Button>
      </div>
      <div className="prototype-browser-bar">
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
            aria-keyshortcuts={`${primaryAriaKey}+L`}
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
        <div
          className="annotation-mode-switcher"
          data-mode={selectedMode || 'browse'}
          tabIndex={0}
          aria-label="切换浏览、批注、截图或预览模式"
        >
          {!selectedMode && (
            <span className="annotation-browse-label">
              <MousePointer2 /> 浏览
            </span>
          )}
          <ToggleGroup
            className="annotation-mode-control"
            type="single"
            value={selectedMode}
            aria-label="标注工具"
            onValueChange={(value) => {
              if (value === 'preview' || (!value && previewOpen)) onTogglePreview();
              else if (value === 'comment' || value === 'capture') onToggleMode(value);
              else if (mode === 'comment' || mode === 'capture') onToggleMode(mode);
            }}
          >
            <ToggleGroupItem value="comment" aria-keyshortcuts="Alt+W" title={`批注（${altKey}W）`}>
              <MessageSquareText /> 批注 <Kbd>{altKey}W</Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem value="capture" aria-keyshortcuts="Alt+A" title={`截图（${altKey}A）`}>
              <Camera /> 截图 <Kbd>{altKey}A</Kbd>
            </ToggleGroupItem>
            <ToggleGroupItem
              value="preview"
              className="preview-toggle-button"
              aria-label="预览"
              aria-pressed={previewOpen}
              aria-keyshortcuts="Alt+B"
              title={`预览（${altKey}B）`}
            >
              <Eye /> 预览 <Kbd>{altKey}B</Kbd>
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <Button
          className="save-annotations-button"
          size="icon"
          aria-label={isSubmitting ? '正在提交标注' : '提交标注'}
          title={isSubmitting ? '正在提交标注…' : `提交标注（${unsubmittedCount} 条待提交）`}
          disabled={unsubmittedCount === 0 || isSubmitting}
          onClick={onOpenReview}
        >
          {isSubmitting ? <LoaderCircle className="spin" /> : <Send />}
          {unsubmittedCount > 0 && (
            <span className="submission-count-badge">
              {unsubmittedCount > 99 ? '99+' : unsubmittedCount}
            </span>
          )}
        </Button>
      </div>
    </>
  );
}
