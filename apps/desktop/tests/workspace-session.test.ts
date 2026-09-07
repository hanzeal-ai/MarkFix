import { describe, expect, it } from 'vitest';
import {
  browserModeFromSession,
  shouldCollapseSidebarForMode,
  shouldRestoreCaptureAfterPageLoad,
} from '../src/renderer/src/annotation-workspace/workspace-session';

describe('annotation workspace session', () => {
  it('restores annotation modes after a shell refresh', () => {
    expect(browserModeFromSession('comment')).toBe('comment');
    expect(browserModeFromSession('capture')).toBe('capture');
  });

  it('falls back to browse for missing or invalid state', () => {
    expect(browserModeFromSession(null)).toBe('browse');
    expect(browserModeFromSession('invalid')).toBe('browse');
  });

  it('collapses the project sidebar when an annotation tool opens', () => {
    expect(shouldCollapseSidebarForMode('comment')).toBe(true);
    expect(shouldCollapseSidebarForMode('capture')).toBe(true);
    expect(shouldCollapseSidebarForMode('browse')).toBe(false);
  });

  it('restores an active capture only after the same page finishes refreshing', () => {
    const refresh = {
      currentUrl: 'https://example.com/page',
      hasSelection: true,
      isLoading: false,
      mode: 'capture' as const,
      selectionUrl: 'https://example.com/page',
      wasLoading: true,
    };

    expect(shouldRestoreCaptureAfterPageLoad(refresh)).toBe(true);
    expect(shouldRestoreCaptureAfterPageLoad({ ...refresh, wasLoading: false })).toBe(false);
    expect(
      shouldRestoreCaptureAfterPageLoad({
        ...refresh,
        currentUrl: 'https://example.com/other',
      }),
    ).toBe(false);
    expect(shouldRestoreCaptureAfterPageLoad({ ...refresh, mode: 'browse' })).toBe(false);
  });
});
