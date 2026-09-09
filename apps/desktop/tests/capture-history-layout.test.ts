import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('capture history card layout', () => {
  it('overrides the shared button row and fixed-height styles', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('../src/renderer/src/styles/saved-annotations.css', import.meta.url)),
      'utf8',
    );
    const rule = stylesheet.match(/\.capture-history-select\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toContain('display: block');
    expect(rule).toContain('height: auto');
    expect(rule).toContain('white-space: normal');
  });

  it('fills the reserved annotation panel to the top and right edges', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('../src/renderer/src/styles/capture-panel.css', import.meta.url)),
      'utf8',
    );
    const rule = stylesheet.match(/\.comment-panel\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toContain('right: 0');
    expect(rule).toContain('top: 56px');
    expect(rule).toContain('bottom: 0');
    expect(rule).toContain('width: var(--annotation-panel-width, 360px)');
    expect(rule).toContain('box-shadow:');
    expect(rule).toContain('-12px 0 28px');
  });

  it('places an element comment below its selector', () => {
    const stylesheet = readFileSync(
      fileURLToPath(new URL('../src/renderer/src/styles/saved-annotations.css', import.meta.url)),
      'utf8',
    );
    const rule = stylesheet.match(/\.element-note-select\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(rule).toContain('display: block');
    expect(rule).toContain('height: auto');
    expect(rule).toContain('white-space: normal');
  });
});
