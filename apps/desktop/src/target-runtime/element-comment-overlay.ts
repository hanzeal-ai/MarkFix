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
  const radius = 11;
  const outsideOffset = 16;
  const preferredX = rect.left - outsideOffset;
  const fallbackX = rect.right + outsideOffset;
  return {
    x:
      preferredX >= radius
        ? preferredX
        : Math.min(viewport.width - radius, Math.max(radius, fallbackX)),
    y: Math.min(
      viewport.height - radius,
      Math.max(radius, rect.top + Math.min(rect.height / 2, 18)),
    ),
  };
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
  private comments: SavedElementComment[] = [];
  private layout = '';
  private renderFrame: number | undefined;
  private readonly scrollTargets = new WeakSet<EventTarget>();

  constructor(
    private readonly surface: () => SVGSVGElement | undefined,
    private readonly isVisible: () => boolean,
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

  setComments(comments: SavedElementComment[]): void {
    this.comments = comments;
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
    if (!this.isVisible()) {
      this.layout = '';
      surface.querySelector(`#${groupId}`)?.remove();
      return;
    }
    const pins = this.comments
      .filter(({ pageUrl }) => pageUrl === location.href)
      .map((comment, index) => {
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
          index,
          ...elementCommentPinPosition(rect, {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        };
      })
      .filter((pin): pin is NonNullable<typeof pin> => Boolean(pin));
    const nextLayout = JSON.stringify(pins);
    if (nextLayout === this.layout) return;
    this.layout = nextLayout;
    surface.querySelector(`#${groupId}`)?.remove();
    const group = svgElement('g');
    group.id = groupId;
    pins.forEach(({ index, x, y }) => {
      const pin = svgElement('g');
      pin.style.pointerEvents = 'none';
      const circle = svgElement('circle');
      setAttributes(circle, {
        cx: String(x),
        cy: String(y),
        r: '11',
        fill: '#202023',
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
    surface.prepend(group);
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
