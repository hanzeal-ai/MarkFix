import { ipcRenderer } from 'electron';
import type { Annotation, AnnotationTool } from '@markfix/contracts';

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

const sendRecorderEvent = (event: Event): void => {
  if (!event.isTrusted) return;
  const target = event.target instanceof Element ? event.target : undefined;
  const elementName =
    target?.getAttribute('aria-label') ??
    target?.textContent?.trim().slice(0, 80) ??
    target?.tagName.toLocaleLowerCase();
  if (event.type === 'click')
    ipcRenderer.send('markfix:recorder-event', {
      type: 'click',
      elementName,
      timestampMs: Date.now(),
    });
};

window.addEventListener('DOMContentLoaded', mount, { once: true });
window.addEventListener('click', sendRecorderEvent, true);
window.addEventListener('resize', () =>
  surface?.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`),
);
ipcRenderer.on('markfix:set-mode', (_event, requestedMode: unknown) => {
  if (!['browse', 'inspect', 'region', 'draw'].includes(String(requestedMode))) return;
  mode = requestedMode as Mode;
  updatePointerMode();
});
ipcRenderer.on('markfix:set-tool', (_event, requestedTool: unknown) => {
  if (['pin', 'rectangle', 'arrow', 'text', 'pen'].includes(String(requestedTool)))
    tool = requestedTool as AnnotationTool;
});
ipcRenderer.on('markfix:show-anchor', (_event, payload: AnchorPayload) => showAnchor(payload));
ipcRenderer.on('markfix:render-annotations', (_event, payload: unknown) => {
  if (Array.isArray(payload)) renderAnnotations(payload as Annotation[]);
});

const observer = new MutationObserver(() => {
  if (document.documentElement.querySelector(`[${hostAttribute}]`) || restoreCount >= 3) return;
  restoreCount += 1;
  mount();
});
window.addEventListener(
  'DOMContentLoaded',
  () => observer.observe(document.documentElement, { childList: true }),
  { once: true },
);
