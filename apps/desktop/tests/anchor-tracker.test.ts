import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementAnchor } from '@markfix/contracts';
import { AnchorTracker } from '../src/target-runtime/anchor-tracker.js';

class FakeSvgElement {
  style: Record<string, string> = {};
  textContent = '';

  setAttribute(): void {}
  append(): void {}
  remove(): void {}
}

class FakeSvgRectElement extends FakeSvgElement {}

const selectedElement: ElementAnchor = {
  kind: 'element',
  cssSelector: '#target',
  textQuote: 'Selected card',
  tagName: 'div',
  attributes: { id: 'target' },
  documentUrl: 'https://example.com/page',
  framePath: [],
  quadsCssPx: [[300, 200, 500, 200, 500, 300, 300, 300]],
};

describe('AnchorTracker scroll recovery', () => {
  const scrollIntoView = vi.fn();
  let rect = { left: 300, top: 200, right: 500, bottom: 300, width: 200, height: 100 };

  beforeEach(() => {
    vi.useFakeTimers();
    scrollIntoView.mockReset();
    const target = {
      id: 'target',
      tagName: 'DIV',
      parentElement: null,
      textContent: 'Selected card',
      getAttribute: (name: string) => (name === 'id' ? 'target' : null),
      getClientRects: () => [rect],
      scrollIntoView,
    };
    vi.stubGlobal('SVGRectElement', FakeSvgRectElement);
    vi.stubGlobal('CSS', { escape: (value: string) => value });
    vi.stubGlobal('location', { href: selectedElement.documentUrl });
    vi.stubGlobal('document', {
      createElementNS: (_namespace: string, tag: string) =>
        tag === 'rect' ? new FakeSvgRectElement() : new FakeSvgElement(),
      documentElement: {},
      querySelectorAll: () => [target],
    });
    vi.stubGlobal('window', {
      innerWidth: 1200,
      setTimeout,
      clearTimeout,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('updates the anchor silently without changing the page scroll position', () => {
    const recoveries: Record<string, unknown>[] = [];
    const tracker = new AnchorTracker(
      () => undefined,
      (payload) => recoveries.push(payload),
    );
    tracker.show(selectedElement);
    rect = { left: 100, top: 200, right: 300, bottom: 300, width: 200, height: 100 };

    tracker.schedule();
    vi.advanceTimersByTime(180);

    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(recoveries).toHaveLength(1);
    expect(recoveries[0]).toMatchObject({
      status: 'resolved',
      silent: true,
      anchor: { quadsCssPx: [[100, 200, 300, 200, 300, 300, 100, 300]] },
    });
  });

  it('still reveals an element during an explicit restore', () => {
    const recoveries: Record<string, unknown>[] = [];
    const tracker = new AnchorTracker(
      () => undefined,
      (payload) => recoveries.push(payload),
    );

    tracker.resolve(selectedElement, true);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'center' });
    expect(recoveries[0]).toMatchObject({ status: 'resolved', silent: false });
  });
});
