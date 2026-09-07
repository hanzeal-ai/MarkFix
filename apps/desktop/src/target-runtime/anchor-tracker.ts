import type { ElementAnchor } from '@markfix/contracts';
import { pickBestAnchorCandidate } from '@markfix/anchor-core';

type Point = { x: number; y: number };

const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS('http://www.w3.org/2000/svg', tag);

const setAttributes = (element: Element, values: Record<string, string>): void => {
  Object.entries(values).forEach(([name, value]) => element.setAttribute(name, value));
};

const cssSelector = (element: Element): string => {
  if (element.id) {
    const candidate = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(candidate).length === 1) return candidate;
  }
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && segments.length < 8) {
    let segment = current.tagName.toLocaleLowerCase();
    const parent: Element | null = current.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter(
        (sibling) => sibling.tagName === current?.tagName,
      );
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    segments.unshift(segment);
    current = parent;
  }
  return segments.join(' > ') || element.tagName.toLocaleLowerCase();
};

const elementAnchor = (element: Element): ElementAnchor | undefined => {
  const quadsCssPx = [...element.getClientRects()]
    .filter(({ width, height }) => width > 0 && height > 0)
    .slice(0, 8)
    .map(({ left, top, right, bottom }) => [left, top, right, top, right, bottom, left, bottom]);
  if (quadsCssPx.length === 0) return undefined;
  const attributes: Record<string, string> = {};
  for (const name of ['id', 'name', 'role', 'type', 'aria-label', 'data-testid']) {
    const value = element.getAttribute(name);
    if (value) attributes[name] = value.slice(0, 200);
  }
  return {
    kind: 'element',
    cssSelector: cssSelector(element),
    textQuote: element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 500) ?? '',
    tagName: element.tagName.toLocaleLowerCase(),
    attributes,
    documentUrl: location.href,
    framePath: [],
    quadsCssPx,
  };
};

const anchorCenter = (anchor: ElementAnchor): Point => {
  const quad = anchor.quadsCssPx[0] ?? [];
  const xValues = quad.filter((_value, index) => index % 2 === 0);
  const yValues = quad.filter((_value, index) => index % 2 === 1);
  return {
    x: xValues.reduce((sum, value) => sum + value, 0) / Math.max(1, xValues.length),
    y: yValues.reduce((sum, value) => sum + value, 0) / Math.max(1, yValues.length),
  };
};

const anchorIdentity = (anchor: ElementAnchor): string =>
  JSON.stringify({
    cssSelector: anchor.cssSelector,
    textQuote: anchor.textQuote,
    tagName: anchor.tagName,
    attributes: anchor.attributes,
    documentUrl: anchor.documentUrl,
    framePath: anchor.framePath,
  });

export class AnchorTracker {
  private trackedAnchor: ElementAnchor | undefined;
  private recoveryTimer: number | undefined;
  private selectionShape: SVGPolygonElement | SVGRectElement | undefined;
  private selectionLabel: SVGGElement | undefined;

  constructor(
    private readonly surface: () => SVGSVGElement | undefined,
    private readonly onRecovery: (payload: Record<string, unknown>) => void,
  ) {}

  resolve(anchor: ElementAnchor, force: boolean): void {
    if (
      !force &&
      this.trackedAnchor &&
      anchorIdentity(anchor) === anchorIdentity(this.trackedAnchor)
    ) {
      this.trackedAnchor = anchor;
      this.render(anchor);
      return;
    }
    this.trackedAnchor = anchor;
    this.recover({ reveal: true, announce: true });
  }

  show(anchor: ElementAnchor): void {
    this.trackedAnchor = anchor;
    this.render(anchor);
  }

  clear(): void {
    this.trackedAnchor = undefined;
    this.clearVisual();
  }

  schedule(): void {
    if (!this.trackedAnchor) return;
    if (this.recoveryTimer) window.clearTimeout(this.recoveryTimer);
    this.recoveryTimer = window.setTimeout(() => {
      this.recoveryTimer = undefined;
      this.recover({ reveal: false, announce: false });
    }, 180);
  }

  private render(anchor: ElementAnchor): void {
    const firstQuad = anchor.quadsCssPx[0];
    if (!firstQuad || firstQuad.length !== 8) return;
    this.clearVisual();
    const [x1, y1, x2, y2, x3, y3, x4, y4] = firstQuad as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const minX = Math.min(x1, x2, x3, x4);
    const maxX = Math.max(x1, x2, x3, x4);
    const minY = Math.min(y1, y2, y3, y4);
    const maxY = Math.max(y1, y2, y3, y4);
    const isAxisAligned =
      Math.abs(y1 - y2) < 0.5 &&
      Math.abs(x2 - x3) < 0.5 &&
      Math.abs(y3 - y4) < 0.5 &&
      Math.abs(x4 - x1) < 0.5;
    const shape = isAxisAligned ? svgElement('rect') : svgElement('polygon');
    if (shape instanceof SVGRectElement) {
      setAttributes(shape, {
        x: String(minX),
        y: String(minY),
        width: String(maxX - minX),
        height: String(maxY - minY),
        rx: '4',
      });
    } else {
      setAttributes(shape, {
        points: `${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`,
        'stroke-linejoin': 'round',
      });
    }
    setAttributes(shape, {
      fill: 'rgba(91,82,232,.08)',
      stroke: '#5b52e8',
      'stroke-width': '2',
      'vector-effect': 'non-scaling-stroke',
    });
    this.surface()?.append(shape);
    this.selectionShape = shape;
    this.renderLabel(anchor.cssSelector, minX, minY);
  }

  private renderLabel(selectorValue: string, minX: number, minY: number): void {
    if (!selectorValue) return;
    const selector = selectorValue.slice(0, 80);
    const x = Math.max(4, minX);
    const y = minY >= 20 ? minY - 20 : minY + 2;
    const width = Math.min(260, Math.max(54, selector.length * 6.5 + 12));
    const group = svgElement('g');
    group.style.pointerEvents = 'none';
    const background = svgElement('rect');
    setAttributes(background, {
      x: String(Math.min(x, Math.max(4, window.innerWidth - width - 4))),
      y: String(y),
      width: String(width),
      height: '20',
      rx: '4',
      fill: '#5b52e8',
    });
    const text = svgElement('text');
    setAttributes(text, {
      x: String(Math.min(x, Math.max(4, window.innerWidth - width - 4)) + 6),
      y: String(y + 14),
      fill: '#fff',
      'font-size': '11',
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
    });
    text.textContent = selector;
    group.append(background, text);
    this.surface()?.append(group);
    this.selectionLabel = group;
  }

  private clearVisual(): void {
    this.selectionShape?.remove();
    this.selectionShape = undefined;
    this.selectionLabel?.remove();
    this.selectionLabel = undefined;
  }

  private recover(options: { reveal: boolean; announce: boolean }): void {
    const original = this.trackedAnchor;
    if (!original || location.href !== original.documentUrl) {
      if (original) {
        this.clearVisual();
        this.onRecovery({ status: 'lost' });
      }
      return;
    }
    const elements = new Set<Element>();
    const selectorMatches = new Set<Element>();
    try {
      document.querySelectorAll(original.cssSelector).forEach((element) => {
        if (elements.size >= 120) return;
        selectorMatches.add(element);
        elements.add(element);
      });
    } catch {
      // Invalid stored selectors fall through to semantic candidates.
    }
    const semanticSelector = [
      original.attributes.id ? `[id="${CSS.escape(original.attributes.id)}"]` : '',
      original.attributes['data-testid']
        ? `[data-testid="${CSS.escape(original.attributes['data-testid'])}"]`
        : '',
      original.attributes.name ? `[name="${CSS.escape(original.attributes.name)}"]` : '',
      original.tagName,
    ]
      .filter(Boolean)
      .join(',');
    try {
      document.querySelectorAll(semanticSelector).forEach((element) => {
        if (elements.size < 120) elements.add(element);
      });
    } catch {
      // Custom tag names can be invalid selectors.
    }
    const originalCenter = anchorCenter(original);
    const entries = [...elements]
      .map((element) => ({ element, anchor: elementAnchor(element) }))
      .filter((item): item is { element: Element; anchor: ElementAnchor } => Boolean(item.anchor))
      .map(({ element, anchor }) => {
        const center = anchorCenter(anchor);
        return {
          element,
          anchor,
          candidate: {
            cssSelectorMatched: selectorMatches.has(element),
            textQuote: anchor.textQuote,
            tagName: anchor.tagName,
            attributes: anchor.attributes,
            centerDistanceCssPx: Math.hypot(
              center.x - originalCenter.x,
              center.y - originalCenter.y,
            ),
          },
        };
      });
    const best = pickBestAnchorCandidate(
      original,
      entries.map(({ candidate }) => candidate),
    );
    if (!best || best.match.confidence === 'low') {
      this.clearVisual();
      this.onRecovery({ status: 'lost', score: best?.match.score ?? 0 });
      return;
    }
    const recoveredEntry = entries.find(({ candidate }) => candidate === best.candidate);
    if (!recoveredEntry) return;
    if (options.reveal)
      recoveredEntry.element.scrollIntoView({ block: 'center', inline: 'center' });
    const recoveredBase = elementAnchor(recoveredEntry.element) ?? recoveredEntry.anchor;
    const recovered: ElementAnchor = {
      ...recoveredBase,
      ...(original.runtimeEvidence ? { runtimeEvidence: original.runtimeEvidence } : {}),
    };
    this.trackedAnchor = recovered;
    this.render(recovered);
    this.onRecovery({
      status: 'resolved',
      anchor: recovered,
      confidence: best.match.confidence,
      score: best.match.score,
      silent: !options.announce,
    });
  }
}
