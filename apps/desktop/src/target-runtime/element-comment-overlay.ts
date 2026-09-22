import type { CapturePin, ElementCommentPin } from '../capture-pin';
import type { SavedElementComment } from '@markfix/contracts';

const groupId = 'markfix-element-comments';

const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS('http://www.w3.org/2000/svg', tag);

const setAttributes = (element: Element, values: Record<string, string>): void => {
  Object.entries(values).forEach(([name, value]) => element.setAttribute(name, value));
};

export const elementCommentPinPosition = (
  rect: Pick<DOMRect, 'left' | 'right' | 'top' | 'height'>,
  viewport: { width: number; height: number },
): { x: number; y: number } => {
  const radius = 12;
  return {
    x: Math.min(viewport.width - radius, Math.max(radius, rect.left)),
    y: Math.min(viewport.height - radius, Math.max(radius, rect.top)),
  };
};

export const avoidOverlappingPins = <T extends { x: number; y: number }>(
  pins: readonly T[],
  viewport: { width: number; height: number },
): T[] => {
  const radius = 12;
  const spacing = 26;
  const placed: T[] = [];
  const maxX = Math.max(radius, viewport.width - radius);
  const maxY = Math.max(radius, viewport.height - radius);
  for (const pin of pins) {
    const originX = Math.max(radius, Math.min(maxX, pin.x));
    const originY = Math.max(radius, Math.min(maxY, pin.y));
    let position = { x: originX, y: originY };
    const free = (x: number, y: number) =>
      placed.every((other) => Math.hypot(other.x - x, other.y - y) >= spacing);
    if (!free(originX, originY)) {
      const rows = [originY];
      for (let distance = spacing; distance <= maxY; distance += spacing) {
        if (originY + distance <= maxY) rows.push(originY + distance);
        if (originY - distance >= radius) rows.push(originY - distance);
      }
      let found = false;
      for (const y of rows) {
        for (let x = originX; x <= maxX; x += spacing) {
          if (free(x, y)) {
            position = { x, y };
            found = true;
            break;
          }
        }
        if (found) break;
      }
      // Use the space to the left if the right-hand columns are full.
      if (!found) {
        for (const y of rows) {
          for (let x = originX - spacing; x >= radius; x -= spacing) {
            if (free(x, y)) {
              position = { x, y };
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
    }
    placed.push({ ...pin, ...position });
  }
  return placed;
};

const findElement = (comment: SavedElementComment): Element | undefined => {
  try {
    const candidates = [...document.querySelectorAll(comment.anchor.cssSelector)];
    if (candidates.length === 1) return candidates[0];
    return candidates.find(
      (element) =>
        element.tagName.toLocaleLowerCase() === comment.anchor.tagName &&
        (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 500) ===
          comment.anchor.textQuote,
    );
  } catch {
    return undefined;
  }
};

export class ElementCommentOverlay {
  private editingId: string | undefined;
  private captures: CapturePin[] = [];
  private comments: ElementCommentPin[] = [];
  private layout = '';
  private renderFrame: number | undefined;
  private readonly scrollTargets = new WeakSet<EventTarget>();

  constructor(
    private readonly surface: () => SVGSVGElement | undefined,
    private readonly isVisible: () => boolean,
    private readonly onSelect: (reference: { type: 'element' | 'capture'; id: string }) => void,
  ) {}

  mount(parent: ParentNode): void {
    this.bindScrollTargets(parent);
    new MutationObserver((records) => {
      records.forEach(({ addedNodes }) =>
        addedNodes.forEach((node) => {
          if (node instanceof Element) this.bindScrollTargets(node);
        }),
      );
      this.schedule();
    }).observe(parent, { childList: true, subtree: true, characterData: true });
    window.setInterval(() => this.render(), 50);
  }

  setComments(comments: ElementCommentPin[]): void {
    this.comments = comments;
    this.render();
  }

  setEditing(id: string | undefined): void {
    this.editingId = id;
    this.render();
  }

  setCaptures(captures: CapturePin[]): void {
    this.captures = captures;
    this.render();
  }

  schedule(): void {
    if (this.renderFrame) return;
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = undefined;
      this.render();
    });
  }

  render(): void {
    const surface = this.surface();
    if (!surface) return;
    if (!this.isVisible() && !this.editingId) {
      this.layout = '';
      surface.querySelector(`#${groupId}`)?.remove();
      return;
    }
    const elementPins = this.comments
      .filter(({ pageUrl }) => pageUrl === location.href)
      .map((comment) => {
        const rect = findElement(comment)?.getBoundingClientRect();
        if (
          !rect ||
          rect.width <= 0 ||
          rect.height <= 0 ||
          rect.right < 0 ||
          rect.bottom < 0 ||
          rect.left > window.innerWidth ||
          rect.top > window.innerHeight
        )
          return undefined;
        return {
          index: comment.previewNumber - 1,
          type: 'element' as const,
          bounds: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          id: comment.id,
          ...elementCommentPinPosition(rect, {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        };
      })
      .filter((pin): pin is NonNullable<typeof pin> => Boolean(pin));
    const capturePins = this.captures
      .filter(({ pageUrl }) => pageUrl === location.href)
      .map((capture) => {
        const selection = capture.selection;
        const left = selection.xCssPx + selection.scrollXCssPx - window.scrollX;
        const top = selection.yCssPx + selection.scrollYCssPx - window.scrollY;
        const right = left + selection.widthCssPx;
        const bottom = top + selection.heightCssPx;
        if (right < 0 || bottom < 0 || left > innerWidth || top > innerHeight) return undefined;
        return {
          index: capture.previewNumber - 1,
          id: capture.id,
          type: 'capture' as const,
          ...elementCommentPinPosition(
            { left, right, top, height: selection.heightCssPx },
            { width: innerWidth, height: innerHeight },
          ),
        };
      })
      .filter((pin): pin is NonNullable<typeof pin> => Boolean(pin));
    const pins = avoidOverlappingPins(
      [...elementPins, ...capturePins].filter(
        (pin) => this.isVisible() || (pin.type === 'capture' && pin.id === this.editingId),
      ),
      { width: innerWidth, height: innerHeight },
    );
    const nextLayout = JSON.stringify({ pins, editingId: this.editingId });
    if (nextLayout === this.layout) {
      const existing = surface.querySelector(`#${groupId}`);
      if (existing && surface.lastElementChild !== existing) surface.append(existing);
      return;
    }
    this.layout = nextLayout;
    surface.querySelector(`#${groupId}`)?.remove();
    const group = svgElement('g');
    group.id = groupId;
    if (this.isVisible()) {
      elementPins.forEach(({ bounds }) => {
        const outline = svgElement('rect');
        outline.setAttribute('data-element-comment-outline', '');
        outline.style.pointerEvents = 'none';
        setAttributes(outline, {
          x: String(bounds.left),
          y: String(bounds.top),
          width: String(bounds.width),
          height: String(bounds.height),
          rx: '4',
          fill: 'none',
          stroke: '#c4b5fd',
          'stroke-width': '1',
          'vector-effect': 'non-scaling-stroke',
        });
        group.append(outline);
      });
    }
    pins.forEach(({ index, id, type, x, y }) => {
      const pin = svgElement('g');
      pin.style.pointerEvents = this.isVisible() ? 'auto' : 'none';
      pin.style.cursor = 'pointer';
      pin.setAttribute('role', 'button');
      pin.setAttribute('data-annotation-type', type);
      pin.setAttribute('aria-label', `编辑批注 ${index + 1}`);
      pin.addEventListener('click', (event) => {
        if (!event.isTrusted) return;
        event.preventDefault();
        event.stopPropagation();
        this.onSelect({ type, id });
      });
      const circle = svgElement('circle');
      setAttributes(circle, {
        cx: String(x),
        cy: String(y),
        r: '11',
        fill: id === this.editingId ? '#16a34a' : '#7357d9',
        stroke: '#fff',
        'stroke-width': '2',
      });
      const label = svgElement('text');
      setAttributes(label, {
        x: String(x),
        y: String(y + 4),
        fill: '#fff',
        'font-size': '11',
        'font-family': 'system-ui',
        'font-weight': '600',
        'text-anchor': 'middle',
      });
      label.textContent = String(index + 1);
      pin.append(circle, label);
      group.append(pin);
    });
    surface.append(group);
  }

  private bindScrollTargets(parent: ParentNode): void {
    const elements = [
      ...(parent instanceof Element ? [parent] : []),
      ...parent.querySelectorAll('*'),
    ];
    elements.forEach((element) => {
      if (this.scrollTargets.has(element)) return;
      this.scrollTargets.add(element);
      element.addEventListener('scroll', () => this.schedule(), { passive: true });
    });
  }
}
