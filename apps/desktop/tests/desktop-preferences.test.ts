import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WebsiteProject } from '@markfix/contracts';
import { normalizeWebsiteShortcuts } from '../src/renderer/src/ProjectNavigation';
import {
  desktopPreferenceKeys,
  newAnnotationStorageModePreference,
  startupProjectPreference,
  startupViewPreference,
} from '../src/renderer/src/desktop-preferences';

const storage = (values: Record<string, string> = {}): Pick<Storage, 'getItem'> => ({
  getItem: (key) => values[key] ?? null,
});

const project = (id: string): WebsiteProject => ({
  id,
  storageMode: 'LOCAL',
  title: id,
  origin: `https://${id}.example.com`,
  entryUrl: `https://${id}.example.com`,
  faviconUrl: null,
  faviconSource: 'root',
  currentPageSessionId: `${id}-session`,
  currentUrl: `https://${id}.example.com`,
  createdAt: '2026-09-07T00:00:00.000Z',
  updatedAt: '2026-09-07T00:00:00.000Z',
});

describe('desktop preferences', () => {
  it('defaults startup to new annotation and its storage mode to cloud', () => {
    expect(startupViewPreference(storage())).toBe('new');
    expect(newAnnotationStorageModePreference(storage())).toBe('CLOUD');
    expect(startupProjectPreference(storage(), [project('first')])).toBeUndefined();
  });

  it('restores the last project when configured', () => {
    const projects = [project('first'), project('last')];
    const preferences = storage({
      [desktopPreferenceKeys.startupView]: 'last-project',
      [desktopPreferenceKeys.lastProjectId]: 'last',
      [desktopPreferenceKeys.newAnnotationStorageMode]: 'LOCAL',
    });

    expect(startupViewPreference(preferences)).toBe('last-project');
    expect(newAnnotationStorageModePreference(preferences)).toBe('LOCAL');
    expect(startupProjectPreference(preferences, projects)?.id).toBe('last');
  });

  it('renders both settings as radio groups with the cloud defaults selected', async () => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { localStorage: storage() },
    });
    const { SettingsWindow } = await import('../src/renderer/src/SettingsWindow');

    const markup = renderToStaticMarkup(createElement(SettingsWindow));

    expect(markup.match(/type="radio"/g)).toHaveLength(4);
    expect(markup).toMatch(/name="startup-view" checked="" value="new"/);
    expect(markup).toMatch(/name="new-annotation-storage-mode" checked="" value="CLOUD"/);
    expect(markup).not.toContain('桌面端');
    expect(markup).toContain('aria-label="通用设置"><h2>启动与新标注</h2>');
  });

  it('defaults existing shortcuts without a saved mode to cloud collaboration', () => {
    expect(
      normalizeWebsiteShortcuts([{ id: 'shortcut', name: 'Example', url: 'https://example.com' }]),
    ).toEqual([
      {
        id: 'shortcut',
        name: 'Example',
        url: 'https://example.com',
        storageMode: 'CLOUD',
      },
    ]);
  });
});
