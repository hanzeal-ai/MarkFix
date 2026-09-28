import { primaryAriaKey, altKey } from '../platform';
import { useState, useEffect, useRef, type RefObject } from 'react';
import type { BrowserMode } from '@markfix/contracts';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  LoaderCircle,
  MessageSquareText,
  Eye,
  MousePointer2,
  RotateCw,
  Send,
} from '@markfix/ui/icons';
import { Button, Input } from '@markfix/ui';
import type { BrowserState } from './model';

type BrowserToolbarProps = {
  addressInputRef: RefObject<HTMLInputElement | null>;
  browserState: BrowserState;
  previewOpen: boolean;
  onTogglePreview: () => void;
  onMenuOpenChange: (open: boolean) => void;
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
  onMenuOpenChange,
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
      : 'browse';
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    onMenuOpenChange(menuOpen);
    return () => onMenuOpenChange(false);
  }, [menuOpen, onMenuOpenChange]);
  const modes = [
    {
      value: 'browse',
      label: '浏览',
      Icon: MousePointer2,
      shortcut: `${altKey}V`,
      ariaShortcut: 'Alt+V',
    },
    {
      value: 'comment',
      label: '批注',
      Icon: MessageSquareText,
      shortcut: `${altKey}W`,
      ariaShortcut: 'Alt+W',
    },
    {
      value: 'capture',
      label: '截图',
      Icon: Camera,
      shortcut: `${altKey}A`,
      ariaShortcut: 'Alt+A',
    },
    { value: 'preview', label: '预览', Icon: Eye, shortcut: `${altKey}B`, ariaShortcut: 'Alt+B' },
  ] as const;
  const current = modes.find(({ value }) => value === selectedMode) ?? modes[0];
  const selectMode = (value: typeof selectedMode) => {
    setMenuOpen(false);
    triggerRef.current?.focus();
    if (value === selectedMode) return;
    if (value === 'preview') onTogglePreview();
    else if (value === 'comment' || value === 'capture') onToggleMode(value);
    else if (previewOpen) onTogglePreview();
    else if (mode === 'comment' || mode === 'capture') onToggleMode(mode);
  };
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
          data-mode={selectedMode}
          onMouseEnter={() => setMenuOpen(true)}
          onMouseLeave={() => setMenuOpen(false)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setMenuOpen(false);
              triggerRef.current?.focus();
            }
          }}
        >
          <Button
            ref={triggerRef}
            className="annotation-mode-trigger"
            aria-keyshortcuts={current.ariaShortcut}
            aria-label={`切换模式：${current.label}`}
            aria-expanded={menuOpen}
            aria-controls="annotation-mode-options"
            onClick={() => setMenuOpen(!menuOpen)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setMenuOpen(true);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLButtonElement>('#annotation-mode-options button')
                    ?.focus(),
                );
              }
            }}
          >
            <current.Icon /> <span>{current.label}</span>
            <kbd>{current.shortcut}</kbd>
            <ChevronDown />
          </Button>
          {menuOpen && (
            <div
              id="annotation-mode-options"
              className="annotation-mode-control"
              role="group"
              aria-label="标注工具"
            >
              {modes.map(({ value, label, Icon, shortcut, ariaShortcut }) => (
                <Button
                  key={value}
                  className={value === 'preview' ? 'preview-toggle-button' : undefined}
                  aria-label={label}
                  aria-keyshortcuts={ariaShortcut}
                  aria-pressed={selectedMode === value}
                  data-state={selectedMode === value ? 'on' : 'off'}
                  onClick={() => selectMode(value)}
                >
                  <Icon />
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </Button>
              ))}
            </div>
          )}
        </div>
        <Button
          className="save-annotations-button"
          aria-label={isSubmitting ? '正在提交标注' : `提交标注 · ${unsubmittedCount} 条待提交`}
          title={isSubmitting ? '正在提交标注…' : `提交标注（${unsubmittedCount} 条待提交）`}
          disabled={unsubmittedCount === 0 || isSubmitting}
          onClick={onOpenReview}
        >
          {isSubmitting ? <LoaderCircle className="spin" /> : <Send />}
          {unsubmittedCount > 0 && (
            <span className="submission-count-badge" aria-hidden="true">
              {unsubmittedCount}
            </span>
          )}
        </Button>
      </div>
    </>
  );
}
