import { ipcRenderer } from 'electron';

type Mode = 'browse' | 'inspect' | 'region' | 'draw';
type Point = { x: number; y: number };
type AnchorPayload = { kind?: unknown; quadsCssPx?: unknown };

const hostAttribute = 'data-markfix-overlay-host';
let mode: Mode = 'browse';
let root: ShadowRoot | undefined;
let surface: SVGSVGElement | undefined;
let selectionShape: SVGPolygonElement | SVGRectElement | undefined;
let dragStart: Point | undefined;
let restoreCount = 0;

const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS('http://www.w3.org/2000/svg', tag);

const updatePointerMode = (): void => {
  if (!surface) return;
  surface.style.pointerEvents = mode === 'region' || mode === 'draw' ? 'auto' : 'none';
  surface.style.cursor = mode === 'region' || mode === 'draw' ? 'crosshair' : 'default';
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
  root.append(surface);
  document.documentElement.append(host);
  updatePointerMode();

  surface.addEventListener('pointerdown', (event) => {
    if (!event.isTrusted || (mode !== 'region' && mode !== 'draw')) return;
    dragStart = { x: event.clientX, y: event.clientY };
    selectionShape?.remove();
    const rectangle = svgElement('rect');
    rectangle.setAttribute('x', String(event.clientX));
    rectangle.setAttribute('y', String(event.clientY));
    rectangle.setAttribute('width', '1');
    rectangle.setAttribute('height', '1');
    rectangle.setAttribute('rx', '4');
    rectangle.setAttribute('fill', 'rgba(232,255,112,.18)');
    rectangle.setAttribute('stroke', '#243e34');
    rectangle.setAttribute('stroke-width', '2');
    rectangle.setAttribute('stroke-dasharray', '7 5');
    surface?.append(rectangle);
    selectionShape = rectangle;
    surface?.setPointerCapture(event.pointerId);
  });
  surface.addEventListener('pointermove', (event) => {
    if (!event.isTrusted || !dragStart || !(selectionShape instanceof SVGRectElement)) return;
    const x = Math.min(dragStart.x, event.clientX);
    const y = Math.min(dragStart.y, event.clientY);
    selectionShape.setAttribute('x', String(x));
    selectionShape.setAttribute('y', String(y));
    selectionShape.setAttribute('width', String(Math.abs(event.clientX - dragStart.x)));
    selectionShape.setAttribute('height', String(Math.abs(event.clientY - dragStart.y)));
  });
  surface.addEventListener('pointerup', (event) => {
    if (!event.isTrusted || !dragStart) return;
    const x = Math.min(dragStart.x, event.clientX);
    const y = Math.min(dragStart.y, event.clientY);
    const width = Math.abs(event.clientX - dragStart.x);
    const height = Math.abs(event.clientY - dragStart.y);
    dragStart = undefined;
    if (width < 5 || height < 5) return;
    ipcRenderer.send('markfix:target-region', {
      kind: 'region',
      xCssPx: x,
      yCssPx: y,
      widthCssPx: width,
      heightCssPx: height,
      documentUrl: location.href,
    });
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
  polygon.setAttribute(
    'points',
    `${firstQuad[0]},${firstQuad[1]} ${firstQuad[2]},${firstQuad[3]} ${firstQuad[4]},${firstQuad[5]} ${firstQuad[6]},${firstQuad[7]}`,
  );
  polygon.setAttribute('fill', 'rgba(232,255,112,.22)');
  polygon.setAttribute('stroke', '#243e34');
  polygon.setAttribute('stroke-width', '2');
  polygon.setAttribute('vector-effect', 'non-scaling-stroke');
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
ipcRenderer.on('markfix:show-anchor', (_event, payload: AnchorPayload) => showAnchor(payload));

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
