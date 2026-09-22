import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WebsiteProject } from '@markfix/contracts';
import { normalizeWebsiteShortcuts } from '../src/renderer/src/project-navigation/website-shortcuts';
import {
  desktopPreferenceKeys,
  elementCommentScreenshotPreference,
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
  it('only enables element screenshots after explicit opt-in', () => {
    expect(elementCommentScreenshotPreference(storage())).toBe(false);
    expect(
      elementCommentScreenshotPreference(
        storage({
          [desktopPreferenceKeys.elementCommentScreenshot]: 'true',
        }),
      ),
    ).toBe(true);
    expect(
      elementCommentScreenshotPreference(
        storage({
          [desktopPreferenceKeys.elementCommentScreenshot]: 'false',
        }),
      ),
    ).toBe(false);
  });

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

    const radios = markup.match(/<button[^>]*role="radio"[^>]*>/g) ?? [];
    expect(radios).toHaveLength(4);
    expect(
      radios
        .filter((radio) => radio.includes('aria-checked="true"'))
        .map((radio) => radio.match(/data-value="([^"]+)"/)?.[1]),
    ).toEqual(['new', 'CLOUD']);
    expect(markup).not.toContain('桌面端');
    expect(markup).toContain('aria-label="通用设置"');
    expect(markup).toContain('<h2>启动与新标注</h2>');
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
