import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { ChildWindowManager } from '../src/main/child-window-manager.js';

vi.mock('electron', () => ({ BrowserWindow: class BrowserWindow {} }));

describe('child window manager', () => {
  it('hides history windows before focusing the main window without detaching them', () => {
    const calls: string[] = [];
    const mainWindow = {
      show: () => calls.push('main:show'),
      focus: () => calls.push('main:focus'),
      moveTop: () => calls.push('main:moveTop'),
    } as unknown as BrowserWindow;
    const manager = new ChildWindowManager({
      mainWindow: () => mainWindow,
      captureExists: async () => true,
      registerShortcuts: () => undefined,
    });

    Object.assign(manager, {
      projectAnnotationHistoryWindow: { hide: () => calls.push('project-history:hide') },
      annotationHistoryWindow: { hide: () => calls.push('history:hide') },
    });

    manager.focusMainFromHistory();

    expect(calls).toEqual([
      'project-history:hide',
      'history:hide',
      'main:show',
      'main:focus',
      'main:moveTop',
    ]);
  });
});
