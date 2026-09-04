import { ipcRenderer } from 'electron';
import type {
  Annotation,
  AnnotationTool,
  ElementAnchor,
  RecorderEvent,
  ScreenshotMark,
  ScreenshotTool,
} from '@markfix/contracts';
import { pickBestAnchorCandidate } from '@markfix/anchor-core';
import {
  createCaptureBounds,
  moveCaptureBounds,
  resizeCaptureBounds,
  type CaptureBounds,
  type CaptureHandle,
} from './capture-selection.js';

type Mode = 'browse' | 'comment' | 'capture' | 'inspect' | 'region' | 'draw';
type Point = { x: number; y: number };
type AnchorPayload = { kind?: unknown; quadsCssPx?: unknown };

const hostAttribute = 'data-markfix-overlay-host';
const annotationGroupId = 'markfix-annotations';
const captureGroupId = 'markfix-capture-selection';
let mode: Mode = 'browse';
let tool: AnnotationTool = 'pin';
let root: ShadowRoot | undefined;
let surface: SVGSVGElement | undefined;
let captureToolbar: HTMLDivElement | undefined;
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
let renderedAnnotations: Annotation[] = [];
let selectedAnnotationId: string | undefined;
let captureBounds: CaptureBounds | undefined;
let captureGesture:
  | { kind: 'create'; start: Point }
  | { kind: 'move'; start: Point; original: CaptureBounds }
  | { kind: 'resize'; start: Point; original: CaptureBounds; handle: CaptureHandle }
  | undefined;
let screenshotTool: ScreenshotTool = 'select';
let screenshotColor = '#ef4444';
let screenshotStrokeWidth: 2 | 4 | 6 = 4;
let screenshotMarks: ScreenshotMark[] = [];
let screenshotRedoMarks: ScreenshotMark[] = [];
let screenshotGesture:
  | {
      tool: Exclude<ScreenshotTool, 'select'>;
      start: Point;
      current: Point;
      points: Point[];
    }
  | undefined;

const svgElement = <K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] =>
  document.createElementNS('http://www.w3.org/2000/svg', tag);

const setAttributes = (element: Element, values: Record<string, string>): void => {
  Object.entries(values).forEach(([name, value]) => element.setAttribute(name, value));
};

const updatePointerMode = (): void => {
  if (!surface) return;
  const capturesPointer = mode === 'capture' || mode === 'region' || mode === 'draw';
  surface.style.pointerEvents = capturesPointer ? 'auto' : 'none';
  surface.style.cursor = capturesPointer ? 'crosshair' : 'default';
  surface.querySelectorAll<SVGGElement>('[data-markfix-annotation-id]').forEach((item) => {
    item.style.pointerEvents = mode === 'browse' ? 'visiblePainted' : 'none';
  });
};

const captureViewport = (): { width: number; height: number } => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

const captureHandlePositions = (
  bounds: CaptureBounds,
): ReadonlyArray<{ handle: CaptureHandle; x: number; y: number; cursor: string }> => {
  const left = bounds.x;
  const centerX = bounds.x + bounds.width / 2;
  const right = bounds.x + bounds.width;
  const top = bounds.y;
  const centerY = bounds.y + bounds.height / 2;
  const bottom = bounds.y + bounds.height;
  return [
    { handle: 'nw', x: left, y: top, cursor: 'nwse-resize' },
    { handle: 'n', x: centerX, y: top, cursor: 'ns-resize' },
    { handle: 'ne', x: right, y: top, cursor: 'nesw-resize' },
    { handle: 'e', x: right, y: centerY, cursor: 'ew-resize' },
    { handle: 'se', x: right, y: bottom, cursor: 'nwse-resize' },
    { handle: 's', x: centerX, y: bottom, cursor: 'ns-resize' },
    { handle: 'sw', x: left, y: bottom, cursor: 'nesw-resize' },
    { handle: 'w', x: left, y: centerY, cursor: 'ew-resize' },
  ];
};

const pointInsideCapture = (point: Point): boolean =>
  Boolean(
    captureBounds &&
    point.x >= captureBounds.x &&
    point.x <= captureBounds.x + captureBounds.width &&
    point.y >= captureBounds.y &&
    point.y <= captureBounds.y + captureBounds.height,
  );

const clipToCapture = (point: Point): Point => ({
  x: Math.min(
    (captureBounds?.x ?? 0) + (captureBounds?.width ?? 0),
    Math.max(captureBounds?.x ?? 0, point.x),
  ),
  y: Math.min(
    (captureBounds?.y ?? 0) + (captureBounds?.height ?? 0),
    Math.max(captureBounds?.y ?? 0, point.y),
  ),
});

const markFromGesture = (
  gesture: NonNullable<typeof screenshotGesture>,
  committed: boolean,
): ScreenshotMark | undefined => {
  const base = {
    id: committed ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000',
    color: screenshotColor,
    strokeWidth: screenshotStrokeWidth,
  } as const;
  if (gesture.tool === 'pen') {
    return gesture.points.length >= 2
      ? { ...base, type: 'pen', points: gesture.points }
      : undefined;
  }
  if (gesture.tool === 'text') {
    return { ...base, type: 'text', position: gesture.start, text: '文字' };
  }
  if (gesture.tool === 'number') {
    return {
      ...base,
      type: 'number',
      position: gesture.start,
      label: screenshotMarks.filter(({ type }) => type === 'number').length + 1,
    };
  }
  if (gesture.tool === 'arrow') {
    return { ...base, type: 'arrow', start: gesture.start, end: gesture.current };
  }
  const bounds = createCaptureBounds(gesture.start, gesture.current, captureViewport());
  if (bounds.width === 0 || bounds.height === 0) return undefined;
  return { ...base, type: gesture.tool, ...bounds };
};

const renderScreenshotMark = (mark: ScreenshotMark, group: SVGGElement): void => {
  if (mark.type === 'rectangle' || mark.type === 'ellipse' || mark.type === 'mosaic') {
    const shape = svgElement(mark.type === 'ellipse' ? 'ellipse' : 'rect');
    if (shape instanceof SVGEllipseElement) {
      setAttributes(shape, {
        cx: String(mark.x + mark.width / 2),
        cy: String(mark.y + mark.height / 2),
        rx: String(mark.width / 2),
        ry: String(mark.height / 2),
      });
    } else {
      setAttributes(shape, {
        x: String(mark.x),
        y: String(mark.y),
        width: String(mark.width),
        height: String(mark.height),
        rx: mark.type === 'mosaic' ? '0' : '3',
      });
    }
    setAttributes(shape, {
      fill: mark.type === 'mosaic' ? 'rgba(107, 114, 128, .72)' : 'transparent',
      stroke: mark.type === 'mosaic' ? 'rgba(255,255,255,.75)' : mark.color,
      'stroke-width': String(mark.strokeWidth),
      ...(mark.type === 'mosaic' ? { 'stroke-dasharray': '4 3' } : {}),
    });
    group.append(shape);
    return;
  }
  if (mark.type === 'arrow') {
    const line = svgElement('line');
    setAttributes(line, {
      x1: String(mark.start.x),
      y1: String(mark.start.y),
      x2: String(mark.end.x),
      y2: String(mark.end.y),
      stroke: mark.color,
      'stroke-width': String(mark.strokeWidth),
      'stroke-linecap': 'round',
    });
    const angle = Math.atan2(mark.end.y - mark.start.y, mark.end.x - mark.start.x);
    const size = 10 + mark.strokeWidth;
    const arrowhead = svgElement('polygon');
    setAttributes(arrowhead, {
      points: [
        mark.end,
        {
          x: mark.end.x - size * Math.cos(angle - Math.PI / 6),
          y: mark.end.y - size * Math.sin(angle - Math.PI / 6),
        },
        {
          x: mark.end.x - size * Math.cos(angle + Math.PI / 6),
          y: mark.end.y - size * Math.sin(angle + Math.PI / 6),
        },
      ]
        .map(({ x, y }) => `${x},${y}`)
        .join(' '),
      fill: mark.color,
    });
    group.append(line, arrowhead);
    return;
  }
  if (mark.type === 'pen') {
    const line = svgElement('polyline');
    setAttributes(line, {
      points: pointsAttribute(mark.points),
      fill: 'none',
      stroke: mark.color,
      'stroke-width': String(mark.strokeWidth),
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
    });
    group.append(line);
    return;
  }
  if (mark.type === 'text') {
    const label = svgElement('text');
    setAttributes(label, {
      x: String(mark.position.x),
      y: String(mark.position.y),
      fill: mark.color,
      'font-size': '18',
      'font-family': 'system-ui',
      'font-weight': '700',
      stroke: 'white',
      'stroke-width': '3',
      'paint-order': 'stroke',
    });
    label.textContent = mark.text;
    group.append(label);
    return;
  }
  const circle = svgElement('circle');
  setAttributes(circle, {
    cx: String(mark.position.x),
    cy: String(mark.position.y),
    r: '13',
    fill: mark.color,
    stroke: 'white',
    'stroke-width': '2',
  });
  const label = svgElement('text');
  setAttributes(label, {
    x: String(mark.position.x),
    y: String(mark.position.y + 4),
    fill: 'white',
    'font-size': '12',
    'font-family': 'system-ui',
    'font-weight': '700',
    'text-anchor': 'middle',
  });
  label.textContent = String(mark.label);
  group.append(circle, label);
};

const emitScreenshotMarks = (): void => {
  ipcRenderer.send('markfix:capture-marks-changed', screenshotMarks);
};

const styleCaptureToolbarButton = (button: HTMLButtonElement, active = false): void => {
  Object.assign(button.style, {
    flex: '0 0 auto',
    width: '31px',
    height: '30px',
    padding: '0',
    border: '0',
    borderRadius: '7px',
    background: active ? '#eeecff' : 'transparent',
    color: active ? '#5b52e8' : '#191a1d',
    display: 'grid',
    placeItems: 'center',
    font: '500 12px Inter, system-ui, sans-serif',
    cursor: 'pointer',
  });
};

const toolbarButton = (
  content: string,
  title: string,
  active: boolean,
  onClick: () => void,
): HTMLButtonElement => {
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = content;
  button.title = title;
  button.setAttribute('aria-label', title);
  styleCaptureToolbarButton(button, active);
  button.querySelectorAll<SVGElement>('svg').forEach((icon) => {
    icon.style.width = '17px';
    icon.style.height = '17px';
  });
  button.addEventListener('pointerdown', (event) => event.stopPropagation());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
};

const toolbarDivider = (): HTMLSpanElement => {
  const divider = document.createElement('span');
  Object.assign(divider.style, {
    flex: '0 0 auto',
    width: '1px',
    height: '20px',
    margin: '0 3px',
    background: '#e2e4e9',
  });
  return divider;
};

const captureToolIcons: Record<ScreenshotTool, string> = {
  select:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 3 14 8-7 2-3 7Z"/></svg>',
  rectangle:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="1"/></svg>',
  ellipse:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5M10 5h9v9"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20c3-5 3-11 8-14 4-2 7 1 5 4-2 3-7 2-7 6 0 2 3 2 6 0"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5h14M12 5v14M8 19h8"/></svg>',
  mosaic:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h5v5H4zM10 4h4v5h-4zM15 4h5v5h-5zM4 10h4v4H4zM9 10h6v4H9zM16 10h4v4h-4zM4 15h6v5H4zM11 15h4v5h-4zM16 15h4v5h-4z"/></svg>',
  number:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="8"/><path d="M10.5 9.5 12 8v8M10 16h4"/></svg>',
};

const renderCaptureToolbar = (): void => {
  if (!captureToolbar) return;
  captureToolbar.replaceChildren();
  if (mode !== 'capture' || !captureBounds) {
    captureToolbar.style.display = 'none';
    return;
  }
  captureToolbar.style.display = 'flex';
  const toolLabel = document.createElement('span');
  toolLabel.textContent = '截图';
  Object.assign(toolLabel.style, {
    flex: '0 0 auto',
    padding: '0 5px 0 2px',
    color: '#90949d',
    font: '400 11px Inter, system-ui, sans-serif',
  });
  captureToolbar.append(toolLabel);
  const tools: ReadonlyArray<{ tool: ScreenshotTool; title: string }> = [
    { tool: 'select', title: '移动选区' },
    { tool: 'rectangle', title: '矩形' },
    { tool: 'ellipse', title: '椭圆' },
    { tool: 'arrow', title: '箭头' },
    { tool: 'pen', title: '画笔' },
    { tool: 'text', title: '文字' },
    { tool: 'mosaic', title: '马赛克' },
    { tool: 'number', title: '序号标记' },
  ];
  tools.forEach(({ tool: requestedTool, title }) => {
    captureToolbar?.append(
      toolbarButton(
        captureToolIcons[requestedTool],
        title,
        screenshotTool === requestedTool,
        () => {
          screenshotTool = requestedTool;
          screenshotGesture = undefined;
          renderCaptureSelection();
        },
      ),
    );
  });
  captureToolbar.append(toolbarDivider());
  const stroke = toolbarButton(
    `<span style="width:17px;border-top:${screenshotStrokeWidth}px solid currentColor"></span>`,
    `线宽 ${screenshotStrokeWidth}px`,
    false,
    () => {
      screenshotStrokeWidth = screenshotStrokeWidth === 2 ? 4 : screenshotStrokeWidth === 4 ? 6 : 2;
      renderCaptureToolbar();
    },
  );
  captureToolbar.append(stroke);
  ['#ef4444', '#f59e0b', '#2563eb', '#202228'].forEach((color) => {
    const button = toolbarButton('', color, screenshotColor === color, () => {
      screenshotColor = color;
      renderCaptureToolbar();
    });
    Object.assign(button.style, {
      width: '15px',
      height: '15px',
      padding: '0',
      border: '2px solid white',
      borderRadius: '50%',
      background: color,
      outline: screenshotColor === color ? '1px solid #61656f' : '1px solid transparent',
      boxShadow: 'none',
    });
    captureToolbar?.append(button);
  });
  captureToolbar.append(toolbarDivider());
  const undo = toolbarButton(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m9 7-5 5 5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/></svg>',
    '撤销',
    false,
    () => {
      const mark = screenshotMarks.at(-1);
      if (!mark) return;
      screenshotMarks = screenshotMarks.slice(0, -1);
      screenshotRedoMarks = [...screenshotRedoMarks, mark];
      emitScreenshotMarks();
      renderCaptureSelection();
    },
  );
  undo.disabled = screenshotMarks.length === 0;
  undo.style.opacity = undo.disabled ? '.4' : '1';
  const redo = toolbarButton(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m15 7 5 5-5 5"/><path d="M19 12h-8a6 6 0 0 0-6 6"/></svg>',
    '重做',
    false,
    () => {
      const mark = screenshotRedoMarks.at(-1);
      if (!mark) return;
      screenshotRedoMarks = screenshotRedoMarks.slice(0, -1);
      screenshotMarks = [...screenshotMarks, mark];
      emitScreenshotMarks();
      renderCaptureSelection();
    },
  );
  redo.disabled = screenshotRedoMarks.length === 0;
  redo.style.opacity = redo.disabled ? '.4' : '1';
  const clear = toolbarButton(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 5 14 14M19 5 5 19"/></svg>',
    '清除标记与选区',
    false,
    () => {
      screenshotMarks = [];
      screenshotRedoMarks = [];
      captureBounds = undefined;
      emitScreenshotMarks();
      emitCaptureSelection();
      renderCaptureSelection();
    },
  );
  captureToolbar.append(undo, redo, clear);
  captureToolbar.append(toolbarDivider());
  const copy = toolbarButton(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
    '复制截图',
    false,
    () => ipcRenderer.send('markfix:capture-action', 'copy'),
  );
  const save = toolbarButton(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>',
    '保存截图',
    false,
    () => ipcRenderer.send('markfix:capture-action', 'save'),
  );
  const finish = toolbarButton(
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>',
    '完成截图',
    false,
    () => ipcRenderer.send('markfix:capture-action', 'finish'),
  );
  finish.style.color = 'white';
  finish.style.background = '#5b52e8';
  captureToolbar.append(copy, save, finish);

  const viewport = captureViewport();
  const toolbarHeight = captureToolbar.offsetHeight || 42;
  const placeBelow = captureBounds.y + captureBounds.height + toolbarHeight + 12 <= viewport.height;
  const preferredLeft = captureBounds.x;
  const toolbarWidth = captureToolbar.scrollWidth || 690;
  Object.assign(captureToolbar.style, {
    left: `${Math.max(12, Math.min(preferredLeft, viewport.width - toolbarWidth - 12))}px`,
    top: `${placeBelow ? captureBounds.y + captureBounds.height + 10 : Math.max(8, captureBounds.y - toolbarHeight - 10)}px`,
  });
};

const renderCaptureSelection = (): void => {
  if (!surface) return;
  surface.querySelector(`#${captureGroupId}`)?.remove();
  if (mode !== 'capture') {
    renderCaptureToolbar();
    return;
  }

  const group = svgElement('g');
  group.id = captureGroupId;
  const mask = svgElement('path');
  const viewport = captureViewport();
  const selectionPath = captureBounds
    ? ` M ${captureBounds.x} ${captureBounds.y} h ${captureBounds.width} v ${captureBounds.height} h ${-captureBounds.width} Z`
    : '';
  setAttributes(mask, {
    d: `M 0 0 H ${viewport.width} V ${viewport.height} H 0 Z${selectionPath}`,
    fill: 'rgba(20, 22, 28, .32)',
    'fill-rule': 'evenodd',
    'pointer-events': 'none',
  });
  group.append(mask);

  if (captureBounds) {
    const clipPath = svgElement('clipPath');
    clipPath.id = 'markfix-capture-clip';
    const clipRectangle = svgElement('rect');
    setAttributes(clipRectangle, {
      x: String(captureBounds.x),
      y: String(captureBounds.y),
      width: String(captureBounds.width),
      height: String(captureBounds.height),
    });
    clipPath.append(clipRectangle);
    group.append(clipPath);
    const marksGroup = svgElement('g');
    marksGroup.setAttribute('clip-path', 'url(#markfix-capture-clip)');
    screenshotMarks.forEach((mark) => renderScreenshotMark(mark, marksGroup));
    const draftMark = screenshotGesture ? markFromGesture(screenshotGesture, false) : undefined;
    if (draftMark) renderScreenshotMark(draftMark, marksGroup);
    marksGroup.style.pointerEvents = 'none';
    group.append(marksGroup);

    const body = svgElement('rect');
    setAttributes(body, {
      x: String(captureBounds.x),
      y: String(captureBounds.y),
      width: String(captureBounds.width),
      height: String(captureBounds.height),
      fill: 'transparent',
      stroke: '#5b52e8',
      'stroke-width': '2',
      'data-capture-body': '',
    });
    body.style.cursor = screenshotTool === 'select' ? 'move' : 'crosshair';
    body.style.pointerEvents = screenshotTool === 'select' ? 'all' : 'none';
    group.append(body);

    captureHandlePositions(captureBounds).forEach(({ handle, x, y, cursor }) => {
      const item = svgElement('rect');
      setAttributes(item, {
        x: String(x - 5),
        y: String(y - 5),
        width: '10',
        height: '10',
        rx: '2',
        fill: 'white',
        stroke: '#5b52e8',
        'stroke-width': '2',
        'data-capture-handle': handle,
      });
      item.style.cursor = cursor;
      item.style.pointerEvents = screenshotTool === 'select' ? 'all' : 'none';
      group.append(item);
    });

    const labelY = Math.max(4, captureBounds.y - 27);
    const labelBackground = svgElement('rect');
    setAttributes(labelBackground, {
      x: String(captureBounds.x - 2),
      y: String(labelY),
      width: '76',
      height: '21',
      rx: '6',
      fill: 'rgba(24, 25, 29, .88)',
      'pointer-events': 'none',
    });
    group.append(labelBackground);
    const label = svgElement('text');
    setAttributes(label, {
      x: String(captureBounds.x + 5),
      y: String(labelY + 14),
      fill: 'white',
      'font-size': '11',
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-weight': '400',
      'pointer-events': 'none',
    });
    label.textContent = `${Math.round(captureBounds.width)} × ${Math.round(captureBounds.height)}`;
    group.append(label);
  }

  surface.append(group);
  renderCaptureToolbar();
};

const emitCaptureSelection = (): void => {
  ipcRenderer.send(
    'markfix:capture-selection',
    captureBounds
      ? {
          kind: 'region',
          xCssPx: captureBounds.x,
          yCssPx: captureBounds.y,
          widthCssPx: captureBounds.width,
          heightCssPx: captureBounds.height,
          documentUrl: location.href,
        }
      : null,
  );
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
  renderedAnnotations = annotations;
  surface.querySelector(`#${annotationGroupId}`)?.remove();
  const group = svgElement('g');
  group.id = annotationGroupId;
  annotations.forEach((annotation) => {
    const item = svgElement('g');
    item.setAttribute('data-markfix-annotation-id', annotation.id);
    item.style.cursor = 'pointer';
    item.style.pointerEvents = mode === 'browse' ? 'visiblePainted' : 'none';
    if (annotation.id === selectedAnnotationId) {
      item.style.filter = `drop-shadow(0 0 3px white) drop-shadow(0 0 6px ${annotation.color})`;
    }
    item.addEventListener('click', (event) => {
      if (mode !== 'browse') return;
      event.preventDefault();
      event.stopPropagation();
      selectedAnnotationId = annotation.id;
      renderAnnotations(renderedAnnotations);
      ipcRenderer.send('markfix:target-annotation-selected', annotation.id);
    });
    renderAnnotation(annotation, item);
    group.append(item);
  });
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
  captureToolbar = document.createElement('div');
  Object.assign(captureToolbar.style, {
    position: 'fixed',
    zIndex: '2147483647',
    minHeight: '42px',
    maxWidth: 'calc(100vw - 16px)',
    padding: '5px 7px',
    border: '1px solid #cfd2d9',
    borderRadius: '10px',
    background: '#ffffff',
    alignItems: 'center',
    gap: '2px',
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    pointerEvents: 'auto',
  });
  root.append(captureToolbar);
  document.documentElement.append(host);
  updatePointerMode();
  renderCaptureSelection();

  surface.addEventListener('pointerdown', (event) => {
    if (
      event.isTrusted &&
      event.button === 0 &&
      mode === 'capture' &&
      screenshotTool !== 'select'
    ) {
      const start = { x: event.clientX, y: event.clientY };
      if (!pointInsideCapture(start)) return;
      const clipped = clipToCapture(start);
      screenshotGesture = {
        tool: screenshotTool,
        start: clipped,
        current: clipped,
        points: [clipped],
      };
      surface?.setPointerCapture(event.pointerId);
      renderCaptureSelection();
      return;
    }
    if (event.isTrusted && event.button === 0 && mode === 'capture') {
      const start = { x: event.clientX, y: event.clientY };
      const target = event.target instanceof Element ? event.target : undefined;
      const requestedHandle = target?.getAttribute('data-capture-handle');
      if (
        captureBounds &&
        requestedHandle &&
        ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].includes(requestedHandle)
      ) {
        captureGesture = {
          kind: 'resize',
          start,
          original: captureBounds,
          handle: requestedHandle as CaptureHandle,
        };
      } else if (captureBounds && target?.hasAttribute('data-capture-body')) {
        captureGesture = { kind: 'move', start, original: captureBounds };
      } else {
        captureGesture = { kind: 'create', start };
        captureBounds = createCaptureBounds(start, start, captureViewport());
        screenshotMarks = [];
        screenshotRedoMarks = [];
        emitScreenshotMarks();
      }
      renderCaptureSelection();
      surface?.setPointerCapture(event.pointerId);
      return;
    }
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
    if (event.isTrusted && mode === 'capture' && screenshotGesture) {
      const current = clipToCapture({ x: event.clientX, y: event.clientY });
      screenshotGesture.current = current;
      if (screenshotGesture.tool === 'pen') screenshotGesture.points.push(current);
      renderCaptureSelection();
      return;
    }
    if (event.isTrusted && mode === 'capture' && captureGesture) {
      const point = { x: event.clientX, y: event.clientY };
      const delta = {
        x: point.x - captureGesture.start.x,
        y: point.y - captureGesture.start.y,
      };
      captureBounds =
        captureGesture.kind === 'create'
          ? createCaptureBounds(captureGesture.start, point, captureViewport())
          : captureGesture.kind === 'move'
            ? moveCaptureBounds(captureGesture.original, delta, captureViewport())
            : resizeCaptureBounds(
                captureGesture.original,
                captureGesture.handle,
                delta,
                captureViewport(),
              );
      renderCaptureSelection();
      return;
    }
    if (!event.isTrusted || !dragStart) return;
    if (tool === 'pen') penPoints.push({ x: event.clientX, y: event.clientY });
    if (!(selectionShape instanceof SVGRectElement)) return;
    selectionShape.setAttribute('x', String(Math.min(dragStart.x, event.clientX)));
    selectionShape.setAttribute('y', String(Math.min(dragStart.y, event.clientY)));
    selectionShape.setAttribute('width', String(Math.abs(event.clientX - dragStart.x)));
    selectionShape.setAttribute('height', String(Math.abs(event.clientY - dragStart.y)));
  });
  surface.addEventListener('pointerup', (event) => {
    if (event.isTrusted && mode === 'capture' && screenshotGesture) {
      const gesture = screenshotGesture;
      screenshotGesture = undefined;
      const distance = Math.hypot(
        gesture.current.x - gesture.start.x,
        gesture.current.y - gesture.start.y,
      );
      const isClickTool = gesture.tool === 'text' || gesture.tool === 'number';
      const mark = isClickTool || distance >= 8 ? markFromGesture(gesture, true) : undefined;
      if (mark) {
        screenshotMarks = [...screenshotMarks, mark];
        screenshotRedoMarks = [];
        emitScreenshotMarks();
      }
      renderCaptureSelection();
      if (surface?.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId);
      return;
    }
    if (event.isTrusted && mode === 'capture' && captureGesture) {
      captureGesture = undefined;
      if (captureBounds && (captureBounds.width < 40 || captureBounds.height < 40)) {
        captureBounds = undefined;
      }
      renderCaptureSelection();
      emitCaptureSelection();
      if (surface?.hasPointerCapture(event.pointerId))
        surface.releasePointerCapture(event.pointerId);
      return;
    }
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
  if (captureBounds)
    captureBounds = createCaptureBounds(
      { x: captureBounds.x, y: captureBounds.y },
      { x: captureBounds.x + captureBounds.width, y: captureBounds.y + captureBounds.height },
      captureViewport(),
    );
  renderCaptureSelection();
  scheduleAnchorRecovery();
});
window.addEventListener('scroll', scheduleAnchorRecovery, true);
ipcRenderer.on('markfix:set-mode', (_event, requestedMode: unknown) => {
  if (
    !['browse', 'comment', 'capture', 'inspect', 'region', 'draw'].includes(String(requestedMode))
  )
    return;
  const leavingCapture = mode === 'capture' && requestedMode !== 'capture';
  mode = requestedMode as Mode;
  if (leavingCapture) {
    captureBounds = undefined;
    captureGesture = undefined;
    emitCaptureSelection();
  }
  updatePointerMode();
  renderCaptureSelection();
});
ipcRenderer.on('markfix:set-tool', (_event, requestedTool: unknown) => {
  if (['pin', 'rectangle', 'arrow', 'text', 'pen'].includes(String(requestedTool)))
    tool = requestedTool as AnnotationTool;
});
ipcRenderer.on('markfix:set-capture-tool', (_event, requestedTool: unknown) => {
  if (
    ['select', 'rectangle', 'ellipse', 'arrow', 'pen', 'text', 'mosaic', 'number'].includes(
      String(requestedTool),
    )
  ) {
    screenshotTool = requestedTool as ScreenshotTool;
    screenshotGesture = undefined;
    renderCaptureSelection();
  }
});
ipcRenderer.on('markfix:set-capture-style', (_event, payload: unknown) => {
  const candidate = payload as { color?: unknown; strokeWidth?: unknown };
  if (typeof candidate.color === 'string' && candidate.color.length <= 32)
    screenshotColor = candidate.color;
  if ([2, 4, 6].includes(Number(candidate.strokeWidth)))
    screenshotStrokeWidth = candidate.strokeWidth as 2 | 4 | 6;
});
ipcRenderer.on('markfix:sync-capture-marks', (_event, payload: unknown) => {
  if (!Array.isArray(payload)) return;
  screenshotMarks = payload as ScreenshotMark[];
  screenshotGesture = undefined;
  renderCaptureSelection();
});
ipcRenderer.on('markfix:clear-capture-selection', () => {
  captureBounds = undefined;
  captureGesture = undefined;
  screenshotGesture = undefined;
  screenshotMarks = [];
  screenshotRedoMarks = [];
  renderCaptureSelection();
  emitCaptureSelection();
  emitScreenshotMarks();
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
  window.setTimeout(
    () =>
      ipcRenderer.send('markfix:overlay-visibility-changed', {
        requestId: candidate.requestId,
        hidden: candidate.hidden,
      }),
    0,
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
ipcRenderer.on('markfix:focus-annotation', (_event, payload: unknown) => {
  if (typeof payload !== 'string' || !renderedAnnotations.some(({ id }) => id === payload)) return;
  selectedAnnotationId = payload;
  renderAnnotations(renderedAnnotations);
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
