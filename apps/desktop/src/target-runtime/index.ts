import { ipcRenderer } from 'electron';
import type { Annotation, AnnotationTool, ElementAnchor, RecorderEvent } from '@markfix/contracts';
import { pickBestAnchorCandidate } from '@markfix/anchor-core';

type Mode = 'browse' | 'inspect' | 'region' | 'draw';
type Point = { x: number; y: number };
type AnchorPayload = { kind?: unknown; quadsCssPx?: unknown };

const hostAttribute = 'data-markfix-overlay-host';
const annotationGroupId = 'markfix-annotations';
let mode: Mode = 'browse';
let tool: AnnotationTool = 'pin';
let root: ShadowRoot | undefined;
let surface: SVGSVGElement | undefined;
let selectionShape: SVGPolygonElement | SVGRectElement | undefined;
let dragStart: Point | undefined;
let penPoints: Point[] = [];
let restoreCount = 0;
let recorderEnabled = false;
let pageRevision: string | undefined;
const runtimeId = crypto.randomUUID();
const pendingInputTimers = new Map<Element, number>();
let pendingScrollTimer: number | undefined;
let lastRecordedScroll = { x: window.scrollX, y: window.scrollY };
let dragOrigin: { target: Element; x: number; y: number } | undefined;
let suppressClickUntil = 0;
let trackedAnchor: ElementAnchor | undefined;
let recoveryTimer: number | undefined;

const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS('http://www.w3.org/2000/svg', tag);

const setAttributes = (element: Element, values: Record<string, string>): void => {
  Object.entries(values).forEach(([name, value]) => element.setAttribute(name, value));
};

const updatePointerMode = (): void => {
  if (!surface) return;
  surface.style.pointerEvents = mode === 'region' || mode === 'draw' ? 'auto' : 'none';
  surface.style.cursor = mode === 'region' || mode === 'draw' ? 'crosshair' : 'default';
};

const pointsAttribute = (points: readonly Point[]): string =>
  points.map(({ x, y }) => `${x},${y}`).join(' ');

const renderAnnotation = (annotation: Annotation, group: SVGGElement): void => {
  if (annotation.type === 'pin') {
    const circle = svgElement('circle');
    setAttributes(circle, {
      cx: String(annotation.position.x),
      cy: String(annotation.position.y),
      r: '13',
      fill: annotation.color,
      stroke: 'white',
      'stroke-width': '2',
    });
    const label = svgElement('text');
    setAttributes(label, {
      x: String(annotation.position.x),
      y: String(annotation.position.y + 4),
      fill: 'white',
      'font-size': '11',
      'font-family': 'system-ui',
      'font-weight': '700',
      'text-anchor': 'middle',
    });
    label.textContent = String(annotation.label);
    group.append(circle, label);
  } else if (annotation.type === 'rectangle') {
    const rectangle = svgElement('rect');
    setAttributes(rectangle, {
      x: String(Math.min(annotation.start.x, annotation.end.x)),
      y: String(Math.min(annotation.start.y, annotation.end.y)),
      width: String(Math.abs(annotation.end.x - annotation.start.x)),
      height: String(Math.abs(annotation.end.y - annotation.start.y)),
      rx: '4',
      fill: `${annotation.color}20`,
      stroke: annotation.color,
      'stroke-width': '3',
    });
    group.append(rectangle);
  } else if (annotation.type === 'arrow') {
    const line = svgElement('line');
    setAttributes(line, {
      x1: String(annotation.start.x),
      y1: String(annotation.start.y),
      x2: String(annotation.end.x),
      y2: String(annotation.end.y),
      stroke: annotation.color,
      'stroke-width': '4',
      'stroke-linecap': 'round',
      'marker-end': 'url(#markfix-arrowhead)',
    });
    group.append(line);
  } else if (annotation.type === 'pen') {
    const polyline = svgElement('polyline');
    setAttributes(polyline, {
      points: pointsAttribute(annotation.points),
      fill: 'none',
      stroke: annotation.color,
      'stroke-width': '3',
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    group.append(polyline);
  } else {
    const text = svgElement('text');
    setAttributes(text, {
      x: String(annotation.position.x),
      y: String(annotation.position.y),
      fill: annotation.color,
      'font-size': '16',
      'font-family': 'system-ui',
      'font-weight': '700',
      stroke: 'white',
      'stroke-width': '3',
      'paint-order': 'stroke',
    });
    text.textContent = annotation.text.slice(0, 120);
    group.append(text);
  }
};

const renderAnnotations = (annotations: Annotation[]): void => {
  if (!surface) return;
  surface.querySelector(`#${annotationGroupId}`)?.remove();
  const group = svgElement('g');
  group.id = annotationGroupId;
  annotations.forEach((annotation) => renderAnnotation(annotation, group));
  surface.prepend(group);
};

const mount = (): void => {
  if (document.documentElement.querySelector(`[${hostAttribute}]`)) return;
  const host = document.createElement('div');
  host.setAttribute(hostAttribute, '');
  Object.assign(host.style, {
    all: 'initial',
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    pointerEvents: 'none',
  });
  root = host.attachShadow({ mode: 'closed' });
  surface = svgElement('svg');
  surface.setAttribute('width', '100%');
  surface.setAttribute('height', '100%');
  surface.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  Object.assign(surface.style, { position: 'fixed', inset: '0', overflow: 'visible' });
  const definitions = svgElement('defs');
  const marker = svgElement('marker');
  setAttributes(marker, {
    id: 'markfix-arrowhead',
    markerWidth: '10',
    markerHeight: '7',
    refX: '9',
    refY: '3.5',
    orient: 'auto',
  });
  const arrow = svgElement('polygon');
  setAttributes(arrow, { points: '0 0, 10 3.5, 0 7', fill: '#ff4d5a' });
  marker.append(arrow);
  definitions.append(marker);
  surface.append(definitions);
  root.append(surface);
  document.documentElement.append(host);
  updatePointerMode();

  surface.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted || (mode !== 'region' && mode !== 'draw')) return;
    dragStart = { x: event.clientX, y: event.clientY };
    penPoints = [dragStart];
    if (mode === 'region' || tool === 'rectangle') {
      selectionShape?.remove();
      const rectangle = svgElement('rect');
      setAttributes(rectangle, {
        x: String(event.clientX),
        y: String(event.clientY),
        width: '1',
        height: '1',
        rx: '4',
        fill: 'rgba(232,255,112,.18)',
        stroke: '#243e34',
        'stroke-width': '2',
        'stroke-dasharray': '7 5',
      });
      surface?.append(rectangle);
      selectionShape = rectangle;
    }
    surface?.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', (event) => {
    if (!event.isTrusted || !dragStart) return;
    if (tool === 'pen') penPoints.push({ x: event.clientX, y: event.clientY });
    if (!(selectionShape instanceof SVGRectElement)) return;
    selectionShape.setAttribute('x', String(Math.min(dragStart.x, event.clientX)));
    selectionShape.setAttribute('y', String(Math.min(dragStart.y, event.clientY)));
    selectionShape.setAttribute('width', String(Math.abs(event.clientX - dragStart.x)));
    selectionShape.setAttribute('height', String(Math.abs(event.clientY - dragStart.y)));
  });
  surface.addEventListener('pointerup', (event) => {
    if (!event.isTrusted || !dragStart) return;
    const start = dragStart;
    const end = { x: event.clientX, y: event.clientY };
    dragStart = undefined;
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    if (mode === 'region') {
      if (width >= 5 && height >= 5)
        ipcRenderer.send('markfix:target-region', {
          kind: 'region',
          xCssPx: Math.min(start.x, end.x),
          yCssPx: Math.min(start.y, end.y),
          widthCssPx: width,
          heightCssPx: height,
          documentUrl: location.href,
        });
      mode = 'browse';
      updatePointerMode();
      return;
    }
    const base = { id: crypto.randomUUID(), color: '#ff4d5a', createdAt: new Date().toISOString() };
    const annotation: Annotation | undefined =
      tool === 'pin'
        ? { ...base, type: 'pin', position: end, label: 1 }
        : tool === 'rectangle' && width >= 5 && height >= 5
          ? { ...base, type: 'rectangle', start, end }
          : tool === 'arrow' && (width >= 5 || height >= 5)
            ? { ...base, type: 'arrow', start, end }
            : tool === 'pen' && penPoints.length >= 2
              ? { ...base, type: 'pen', points: penPoints }
              : tool === 'text'
                ? { ...base, type: 'text', position: end, text: 'Comment' }
                : undefined;
    if (annotation) ipcRenderer.send('markfix:target-annotation', annotation);
    mode = 'browse';
    updatePointerMode();
  });
};

const showAnchor = (payload: AnchorPayload): void => {
  if (payload.kind !== 'element' || !Array.isArray(payload.quadsCssPx)) return;
  const firstQuad = payload.quadsCssPx[0];
  if (
    !Array.isArray(firstQuad) ||
    firstQuad.length !== 8 ||
    !firstQuad.every((value) => typeof value === 'number')
  )
    return;
  selectionShape?.remove();
  const polygon = svgElement('polygon');
  setAttributes(polygon, {
    points: `${firstQuad[0]},${firstQuad[1]} ${firstQuad[2]},${firstQuad[3]} ${firstQuad[4]},${firstQuad[5]} ${firstQuad[6]},${firstQuad[7]}`,
    fill: 'rgba(232,255,112,.22)',
    stroke: '#243e34',
    'stroke-width': '2',
    'vector-effect': 'non-scaling-stroke',
  });
  surface?.append(polygon);
  selectionShape = polygon;
};

const isOverlayElement = (target: Element): boolean =>
  target.hasAttribute(hostAttribute) || Boolean(target.closest(`[${hostAttribute}]`));

const elementName = (element: Element): string => {
  const label =
    element.getAttribute('aria-label') ||
    element.getAttribute('placeholder') ||
    element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 120);
  return (label || element.tagName.toLocaleLowerCase()).slice(0, 120);
};

const cssSelector = (element: Element): string => {
  if (element.id) {
    const candidate = `#${CSS.escape(element.id)}`;
    if (document.querySelectorAll(candidate).length === 1) return candidate;
  }
  const segments: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.documentElement && segments.length < 5) {
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

const recoverAnchor = (): void => {
  const original = trackedAnchor;
  if (!original || location.href !== original.documentUrl) {
    if (original) ipcRenderer.send('markfix:anchor-recovery', { status: 'lost' });
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
    // Obsolete selectors fall through to semantic candidates.
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
    // Target pages can contain custom tag names that are not valid selectors.
  }
  const originalCenter = anchorCenter(original);
  const entries = [...elements]
    .map((element) => ({ element, anchor: elementAnchor(element) }))
    .filter((item): item is { element: Element; anchor: ElementAnchor } => Boolean(item.anchor))
    .map(({ element, anchor }) => {
      const center = anchorCenter(anchor);
      return {
        anchor,
        candidate: {
          cssSelectorMatched: selectorMatches.has(element),
          textQuote: anchor.textQuote,
          tagName: anchor.tagName,
          attributes: anchor.attributes,
          centerDistanceCssPx: Math.hypot(center.x - originalCenter.x, center.y - originalCenter.y),
        },
      };
    });
  const best = pickBestAnchorCandidate(
    original,
    entries.map(({ candidate }) => candidate),
  );
  if (!best || best.match.confidence === 'low') {
    ipcRenderer.send('markfix:anchor-recovery', {
      status: 'lost',
      score: best?.match.score ?? 0,
    });
    return;
  }
  const recovered = entries.find(({ candidate }) => candidate === best.candidate)?.anchor;
  if (!recovered) return;
  trackedAnchor = recovered;
  showAnchor(recovered);
  ipcRenderer.send('markfix:anchor-recovery', {
    status: 'resolved',
    anchor: recovered,
    confidence: best.match.confidence,
    score: best.match.score,
  });
};

const scheduleAnchorRecovery = (): void => {
  if (!trackedAnchor) return;
  if (recoveryTimer) window.clearTimeout(recoveryTimer);
  recoveryTimer = window.setTimeout(() => {
    recoveryTimer = undefined;
    recoverAnchor();
  }, 180);
};

type RecorderPayload = Omit<RecorderEvent, 'protocolVersion' | 'runtimeId' | 'pageRevision'>;

const emitRecorderEvent = (payload: RecorderPayload, revision = pageRevision): void => {
  if (!recorderEnabled || !revision || revision !== pageRevision) return;
  ipcRenderer.send('markfix:recorder-event', {
    protocolVersion: 1,
    runtimeId,
    pageRevision: revision,
    ...payload,
  } satisfies RecorderEvent);
};

const recorderTarget = (event: Event): Element | undefined => {
  const target = event.target instanceof Element ? event.target : undefined;
  return target && !isOverlayElement(target) ? target : undefined;
};

const recordClick = (event: MouseEvent): void => {
  if (!event.isTrusted || event.detail > 1 || Date.now() <= suppressClickUntil) return;
  const target = recorderTarget(event);
  if (!target) return;
  emitRecorderEvent({
    type: 'click',
    elementName: elementName(target),
    mouseButton: event.button,
    timestampMs: Date.now(),
    anchor: elementAnchor(target),
  });
};

const recordInput = (event: Event): void => {
  if (!event.isTrusted) return;
  const target = recorderTarget(event);
  if (
    !target ||
    (!(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLTextAreaElement) &&
      !target.hasAttribute('contenteditable'))
  )
    return;
  const revision = pageRevision;
  const previousTimer = pendingInputTimers.get(target);
  if (previousTimer) window.clearTimeout(previousTimer);
  const valueLength =
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      ? target.value.length
      : target.textContent?.length;
  const inputKind = target instanceof HTMLInputElement ? target.type : target.tagName.toLowerCase();
  const timer = window.setTimeout(() => {
    pendingInputTimers.delete(target);
    emitRecorderEvent(
      {
        type: 'input',
        elementName: elementName(target),
        valueLength,
        inputKind,
        timestampMs: Date.now(),
        anchor: elementAnchor(target),
      },
      revision,
    );
  }, 500);
  pendingInputTimers.set(target, timer);
};

const recordChange = (event: Event): void => {
  if (!event.isTrusted) return;
  const target = recorderTarget(event);
  if (!(target instanceof HTMLSelectElement)) return;
  emitRecorderEvent({
    type: 'select',
    elementName: elementName(target),
    selectedCount: target.selectedOptions.length,
    timestampMs: Date.now(),
    anchor: elementAnchor(target),
  });
};

const recordScroll = (event: Event): void => {
  if (!event.isTrusted || !recorderEnabled) return;
  if (pendingScrollTimer) window.clearTimeout(pendingScrollTimer);
  const revision = pageRevision;
  pendingScrollTimer = window.setTimeout(() => {
    pendingScrollTimer = undefined;
    const x = window.scrollX;
    const y = window.scrollY;
    if (Math.hypot(x - lastRecordedScroll.x, y - lastRecordedScroll.y) < 80) return;
    lastRecordedScroll = { x, y };
    emitRecorderEvent(
      { type: 'scroll', scrollXCssPx: x, scrollYCssPx: y, timestampMs: Date.now() },
      revision,
    );
  }, 300);
};

const recordPointerDown = (event: PointerEvent): void => {
  if (!event.isTrusted || event.button !== 0) return;
  const target = recorderTarget(event);
  if (target) dragOrigin = { target, x: event.clientX, y: event.clientY };
};

const recordPointerUp = (event: PointerEvent): void => {
  if (!event.isTrusted || !dragOrigin) return;
  const origin = dragOrigin;
  dragOrigin = undefined;
  if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 12) return;
  const target = recorderTarget(event);
  suppressClickUntil = Date.now() + 100;
  emitRecorderEvent({
    type: 'drag',
    elementName: elementName(origin.target),
    timestampMs: Date.now(),
    anchor: elementAnchor(origin.target),
    endAnchor: target ? elementAnchor(target) : undefined,
  });
};

window.addEventListener('DOMContentLoaded', mount, { once: true });
window.addEventListener('click', recordClick, true);
window.addEventListener('input', recordInput, true);
window.addEventListener('change', recordChange, true);
window.addEventListener('scroll', recordScroll, true);
window.addEventListener('pointerdown', recordPointerDown, true);
window.addEventListener('pointerup', recordPointerUp, true);
window.addEventListener('resize', () => {
  surface?.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  scheduleAnchorRecovery();
});
window.addEventListener('scroll', scheduleAnchorRecovery, true);
ipcRenderer.on('markfix:set-mode', (_event, requestedMode: unknown) => {
  if (!['browse', 'inspect', 'region', 'draw'].includes(String(requestedMode))) return;
  mode = requestedMode as Mode;
  updatePointerMode();
});
ipcRenderer.on('markfix:set-tool', (_event, requestedTool: unknown) => {
  if (['pin', 'rectangle', 'arrow', 'text', 'pen'].includes(String(requestedTool)))
    tool = requestedTool as AnnotationTool;
});
ipcRenderer.on('markfix:set-recorder', (_event, payload: unknown) => {
  const candidate = payload as { enabled?: unknown; pageRevision?: unknown };
  if (typeof candidate.enabled !== 'boolean' || typeof candidate.pageRevision !== 'string') return;
  recorderEnabled = candidate.enabled;
  pageRevision = candidate.pageRevision;
  lastRecordedScroll = { x: window.scrollX, y: window.scrollY };
  if (!recorderEnabled) {
    for (const timer of pendingInputTimers.values()) window.clearTimeout(timer);
    pendingInputTimers.clear();
    if (pendingScrollTimer) window.clearTimeout(pendingScrollTimer);
    pendingScrollTimer = undefined;
    dragOrigin = undefined;
  }
});
ipcRenderer.on('markfix:set-overlay-hidden', (_event, payload: unknown) => {
  const candidate = payload as { requestId?: unknown; hidden?: unknown };
  if (typeof candidate.requestId !== 'string' || typeof candidate.hidden !== 'boolean') return;
  const host = document.documentElement.querySelector<HTMLElement>(`[${hostAttribute}]`);
  if (!host) return;
  host.style.visibility = candidate.hidden ? 'hidden' : 'visible';
  window.requestAnimationFrame(() =>
    ipcRenderer.send('markfix:overlay-visibility-changed', {
      requestId: candidate.requestId,
      hidden: candidate.hidden,
    }),
  );
});
ipcRenderer.on('markfix:resolve-anchor', (_event, payload: unknown) => {
  const candidate = payload as { anchor?: unknown; force?: unknown };
  const anchor = candidate.anchor as ElementAnchor | undefined;
  if (!anchor || anchor.kind !== 'element') return;
  if (
    !candidate.force &&
    trackedAnchor &&
    anchorIdentity(anchor) === anchorIdentity(trackedAnchor)
  ) {
    trackedAnchor = anchor;
    showAnchor(anchor);
    return;
  }
  trackedAnchor = anchor;
  recoverAnchor();
});
ipcRenderer.on('markfix:clear-anchor', () => {
  trackedAnchor = undefined;
  selectionShape?.remove();
  selectionShape = undefined;
});
ipcRenderer.on('markfix:show-anchor', (_event, payload: AnchorPayload) => {
  if (payload.kind === 'element') trackedAnchor = payload as ElementAnchor;
  showAnchor(payload);
});
ipcRenderer.on('markfix:render-annotations', (_event, payload: unknown) => {
  if (Array.isArray(payload)) renderAnnotations(payload as Annotation[]);
});

const observer = new MutationObserver(() => {
  if (!document.documentElement.querySelector(`[${hostAttribute}]`) && restoreCount < 3) {
    restoreCount += 1;
    mount();
  }
  scheduleAnchorRecovery();
});
window.addEventListener(
  'DOMContentLoaded',
  () => observer.observe(document.documentElement, { childList: true, subtree: true }),
  { once: true },
);
