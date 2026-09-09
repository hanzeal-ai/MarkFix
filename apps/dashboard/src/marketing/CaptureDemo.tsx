import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  Check,
  Copy,
  Download,
  MousePointer2,
  PenLine,
  Redo2,
  Square,
  Type,
  Undo2,
  X,
} from '@markfix/ui/icons';

type Point = { x: number; y: number };
type Selection = Point & { width: number; height: number };
type CaptureTool =
  'select' | 'rectangle' | 'ellipse' | 'arrow' | 'pen' | 'text' | 'mosaic' | 'number';
type Color = '#ef4444' | '#f59e0b' | '#2563eb' | '#202228';
type StrokeWidth = 2 | 4 | 6;

type MarkBase = { id: number; color: Color; strokeWidth: StrokeWidth };
type CaptureMark =
  | (MarkBase & {
      type: 'rectangle' | 'ellipse' | 'mosaic';
      x: number;
      y: number;
      width: number;
      height: number;
    })
  | (MarkBase & { type: 'arrow'; start: Point; end: Point })
  | (MarkBase & { type: 'pen'; points: Point[] })
  | (MarkBase & { type: 'text'; position: Point; text: string })
  | (MarkBase & { type: 'number'; position: Point; label: number });

type Gesture =
  | { kind: 'selection'; start: Point }
  | { kind: 'mark'; start: Point; points: Point[] }
  | { kind: 'move'; start: Point; selection: Selection; marks: CaptureMark[] }
  | { kind: 'resize'; start: Point; selection: Selection; corner: 'nw' | 'ne' | 'sw' | 'se' };

type CaptureDemoProps = {
  active: boolean;
  onComplete: (selection: Selection) => void;
  resetKey: number;
  showToast: (message: string) => void;
};

const colors: Color[] = ['#ef4444', '#f59e0b', '#2563eb', '#202228'];

const inside = (point: Point, selection: Selection) =>
  point.x >= selection.x &&
  point.x <= selection.x + selection.width &&
  point.y >= selection.y &&
  point.y <= selection.y + selection.height;

const clampPoint = (point: Point, selection: Selection): Point => ({
  x: Math.max(selection.x, Math.min(point.x, selection.x + selection.width)),
  y: Math.max(selection.y, Math.min(point.y, selection.y + selection.height)),
});

const shiftMark = (mark: CaptureMark, dx: number, dy: number): CaptureMark => {
  if (mark.type === 'pen') {
    return { ...mark, points: mark.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  }
  if (mark.type === 'arrow') {
    return {
      ...mark,
      start: { x: mark.start.x + dx, y: mark.start.y + dy },
      end: { x: mark.end.x + dx, y: mark.end.y + dy },
    };
  }
  if (mark.type === 'text' || mark.type === 'number') {
    return { ...mark, position: { x: mark.position.x + dx, y: mark.position.y + dy } };
  }
  return { ...mark, x: mark.x + dx, y: mark.y + dy };
};

function CaptureMarkView({ mark }: { mark: CaptureMark }) {
  if (mark.type === 'rectangle' || mark.type === 'mosaic') {
    return (
      <rect
        x={mark.x}
        y={mark.y}
        width={mark.width}
        height={mark.height}
        fill={mark.type === 'mosaic' ? 'url(#mf-demo-mosaic)' : 'transparent'}
        stroke={mark.type === 'mosaic' ? '#ffffff' : mark.color}
        strokeWidth={mark.strokeWidth}
      />
    );
  }
  if (mark.type === 'ellipse') {
    return (
      <ellipse
        cx={mark.x + mark.width / 2}
        cy={mark.y + mark.height / 2}
        rx={mark.width / 2}
        ry={mark.height / 2}
        fill="transparent"
        stroke={mark.color}
        strokeWidth={mark.strokeWidth}
      />
    );
  }
  if (mark.type === 'arrow') {
    return (
      <line
        x1={mark.start.x}
        y1={mark.start.y}
        x2={mark.end.x}
        y2={mark.end.y}
        stroke={mark.color}
        strokeWidth={mark.strokeWidth}
        markerEnd="url(#mf-demo-arrow)"
      />
    );
  }
  if (mark.type === 'pen') {
    return (
      <polyline
        points={mark.points.map(({ x, y }) => `${x},${y}`).join(' ')}
        fill="none"
        stroke={mark.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={mark.strokeWidth}
      />
    );
  }
  if (mark.type === 'text') {
    return (
      <text
        x={mark.position.x}
        y={mark.position.y}
        fill={mark.color}
        fontSize="18"
        fontWeight="700"
      >
        {mark.text}
      </text>
    );
  }
  if (mark.type !== 'number') return null;
  return (
    <g>
      <circle cx={mark.position.x} cy={mark.position.y} r="13" fill={mark.color} />
      <text
        x={mark.position.x}
        y={mark.position.y + 4}
        fill="#fff"
        fontSize="12"
        fontWeight="700"
        textAnchor="middle"
      >
        {mark.label}
      </text>
    </g>
  );
}

export function CaptureDemo({ active, onComplete, resetKey, showToast }: CaptureDemoProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const nextMarkId = useRef(1);
  const pointerFrame = useRef<number | undefined>(undefined);
  const pendingPoint = useRef<Point | null>(null);
  const draftMarkRef = useRef<CaptureMark | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [tool, setTool] = useState<CaptureTool>('select');
  const [color, setColor] = useState<Color>('#ef4444');
  const [strokeWidth, setStrokeWidth] = useState<StrokeWidth>(2);
  const [marks, setMarks] = useState<CaptureMark[]>([]);
  const [redoMarks, setRedoMarks] = useState<CaptureMark[]>([]);
  const [draftMark, setDraftMark] = useState<CaptureMark | null>(null);

  useEffect(() => {
    setSelection(null);
    setMarks([]);
    setRedoMarks([]);
    setDraftMark(null);
    draftMarkRef.current = null;
    setTool('select');
  }, [resetKey]);

  useEffect(
    () => () => {
      if (pointerFrame.current !== undefined) cancelAnimationFrame(pointerFrame.current);
    },
    [],
  );

  if (!active) return null;

  const pointFor = (event: ReactPointerEvent): Point | null => {
    const bounds = overlayRef.current?.getBoundingClientRect();
    if (!bounds) return null;
    return {
      x: Math.max(0, Math.min(event.clientX - bounds.left, bounds.width)),
      y: Math.max(0, Math.min(event.clientY - bounds.top, bounds.height)),
    };
  };

  const markFromGesture = (start: Point, end: Point, points: Point[]): CaptureMark | null => {
    const base = { id: nextMarkId.current, color, strokeWidth };
    if (tool === 'pen') return points.length > 1 ? { ...base, type: 'pen', points } : null;
    if (tool === 'arrow') return { ...base, type: 'arrow', start, end };
    if (tool === 'rectangle' || tool === 'ellipse' || tool === 'mosaic') {
      return {
        ...base,
        type: tool,
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
        width: Math.abs(end.x - start.x),
        height: Math.abs(end.y - start.y),
      };
    }
    return null;
  };

  const begin = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFor(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);

    if (!selection || (tool === 'select' && !inside(point, selection))) {
      gesture.current = { kind: 'selection', start: point };
      setSelection({ ...point, width: 0, height: 0 });
      setMarks([]);
      setRedoMarks([]);
      return;
    }

    if (tool === 'select') {
      gesture.current = { kind: 'move', start: point, selection, marks };
      return;
    }

    const bounded = clampPoint(point, selection);
    if (tool === 'text' || tool === 'number') {
      const nextMark: CaptureMark =
        tool === 'text'
          ? {
              id: nextMarkId.current,
              color,
              strokeWidth,
              type: 'text',
              position: bounded,
              text: '文字',
            }
          : {
              id: nextMarkId.current,
              color,
              strokeWidth,
              type: 'number',
              position: bounded,
              label: marks.filter((mark) => mark.type === 'number').length + 1,
            };
      nextMarkId.current += 1;
      setMarks((current) => [...current, nextMark]);
      setRedoMarks([]);
      return;
    }

    gesture.current = { kind: 'mark', start: bounded, points: [bounded] };
  };

  const applyMove = (point: Point) => {
    const currentGesture = gesture.current;
    if (!currentGesture) return;

    if (currentGesture.kind === 'selection') {
      setSelection({
        x: Math.min(currentGesture.start.x, point.x),
        y: Math.min(currentGesture.start.y, point.y),
        width: Math.abs(point.x - currentGesture.start.x),
        height: Math.abs(point.y - currentGesture.start.y),
      });
      return;
    }

    if (currentGesture.kind === 'move') {
      const bounds = overlayRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const dx = Math.max(
        -currentGesture.selection.x,
        Math.min(
          point.x - currentGesture.start.x,
          bounds.width - currentGesture.selection.x - currentGesture.selection.width,
        ),
      );
      const dy = Math.max(
        -currentGesture.selection.y,
        Math.min(
          point.y - currentGesture.start.y,
          bounds.height - currentGesture.selection.y - currentGesture.selection.height,
        ),
      );
      setSelection({
        ...currentGesture.selection,
        x: currentGesture.selection.x + dx,
        y: currentGesture.selection.y + dy,
      });
      setMarks(currentGesture.marks.map((mark) => shiftMark(mark, dx, dy)));
      return;
    }

    if (currentGesture.kind === 'resize') {
      const origin = currentGesture.selection;
      const left = currentGesture.corner.includes('w')
        ? Math.min(point.x, origin.x + origin.width - 40)
        : origin.x;
      const top = currentGesture.corner.includes('n')
        ? Math.min(point.y, origin.y + origin.height - 40)
        : origin.y;
      const right = currentGesture.corner.includes('e')
        ? Math.max(point.x, origin.x + 40)
        : origin.x + origin.width;
      const bottom = currentGesture.corner.includes('s')
        ? Math.max(point.y, origin.y + 40)
        : origin.y + origin.height;
      setSelection({ x: left, y: top, width: right - left, height: bottom - top });
      return;
    }

    if (!selection) return;
    const bounded = clampPoint(point, selection);
    const points = tool === 'pen' ? [...currentGesture.points, bounded] : currentGesture.points;
    gesture.current = { ...currentGesture, points };
    const nextDraft = markFromGesture(currentGesture.start, bounded, points);
    draftMarkRef.current = nextDraft;
    setDraftMark(nextDraft);
  };

  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = pointFor(event);
    if (!gesture.current || !point) return;
    pendingPoint.current = point;
    if (pointerFrame.current !== undefined) return;
    pointerFrame.current = requestAnimationFrame(() => {
      pointerFrame.current = undefined;
      const nextPoint = pendingPoint.current;
      pendingPoint.current = null;
      if (nextPoint) applyMove(nextPoint);
    });
  };

  const end = () => {
    if (pointerFrame.current !== undefined) {
      cancelAnimationFrame(pointerFrame.current);
      pointerFrame.current = undefined;
    }
    const finalPoint = pendingPoint.current;
    pendingPoint.current = null;
    if (finalPoint) applyMove(finalPoint);
    const currentGesture = gesture.current;
    gesture.current = null;
    if (!currentGesture) return;

    if (currentGesture.kind === 'selection') {
      setSelection((current) => {
        if (!current || current.width < 28 || current.height < 28) return null;
        return current;
      });
      return;
    }

    const finalDraft = draftMarkRef.current;
    if (currentGesture.kind === 'mark' && finalDraft) {
      if ('width' in finalDraft && (finalDraft.width < 5 || finalDraft.height < 5)) {
        draftMarkRef.current = null;
        setDraftMark(null);
        return;
      }
      setMarks((current) => [...current, { ...finalDraft, id: nextMarkId.current }]);
      nextMarkId.current += 1;
      setRedoMarks([]);
      draftMarkRef.current = null;
      setDraftMark(null);
    }
  };

  const beginResize = (
    event: ReactPointerEvent<SVGRectElement>,
    corner: 'nw' | 'ne' | 'sw' | 'se',
  ) => {
    if (!selection || tool !== 'select') return;
    const point = pointFor(event);
    if (!point) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { kind: 'resize', start: point, selection, corner };
  };

  const undo = () => {
    const last = marks.at(-1);
    if (!last) return;
    setMarks((current) => current.slice(0, -1));
    setRedoMarks((current) => [...current, last]);
  };

  const redo = () => {
    const last = redoMarks.at(-1);
    if (!last) return;
    setRedoMarks((current) => current.slice(0, -1));
    setMarks((current) => [...current, last]);
  };

  const clear = () => {
    setSelection(null);
    setMarks([]);
    setRedoMarks([]);
    setDraftMark(null);
  };

  const toolItems: Array<{ value: CaptureTool; label: string; icon: ReactNode }> = [
    { value: 'select', label: '移动选区', icon: <MousePointer2 /> },
    { value: 'rectangle', label: '矩形', icon: <Square /> },
    { value: 'ellipse', label: '椭圆', icon: <span className="mf-capture-ellipse" /> },
    { value: 'arrow', label: '箭头', icon: <ArrowRight /> },
    { value: 'pen', label: '画笔', icon: <PenLine /> },
    { value: 'text', label: '文字', icon: <Type /> },
    { value: 'mosaic', label: '马赛克', icon: <span className="mf-capture-mosaic-icon" /> },
    { value: 'number', label: '序号', icon: <span className="mf-capture-number-icon">1</span> },
  ];
  const toolbarTop = selection
    ? selection.y + selection.height + 54 <= (overlayRef.current?.clientHeight ?? 650)
      ? selection.y + selection.height + 10
      : Math.max(8, selection.y - 48)
    : 0;

  return (
    <div
      className="mf-capture-demo"
      ref={overlayRef}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <svg className="mf-capture-canvas" aria-hidden="true">
        <defs>
          <pattern id="mf-demo-mosaic" width="12" height="12" patternUnits="userSpaceOnUse">
            <rect width="6" height="6" fill="#9ca3af" />
            <rect x="6" width="6" height="6" fill="#d1d5db" />
            <rect y="6" width="6" height="6" fill="#e5e7eb" />
            <rect x="6" y="6" width="6" height="6" fill="#a8aab0" />
          </pattern>
          <marker
            id="mf-demo-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L7,3 z" fill={color} />
          </marker>
          {selection ? (
            <clipPath id="mf-demo-selection-clip">
              <rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
              />
            </clipPath>
          ) : null}
          <mask id="mf-demo-selection-mask">
            <rect width="100%" height="100%" fill="white" />
            {selection ? (
              <rect
                x={selection.x}
                y={selection.y}
                width={selection.width}
                height={selection.height}
                fill="black"
              />
            ) : null}
          </mask>
        </defs>
        <rect
          className="mf-capture-shade"
          width="100%"
          height="100%"
          mask="url(#mf-demo-selection-mask)"
        />
        {selection ? (
          <g>
            <g clipPath="url(#mf-demo-selection-clip)">
              {marks.map((mark) => (
                <CaptureMarkView key={mark.id} mark={mark} />
              ))}
              {draftMark ? <CaptureMarkView mark={draftMark} /> : null}
            </g>
            <rect
              className="mf-capture-selection-border"
              x={selection.x}
              y={selection.y}
              width={selection.width}
              height={selection.height}
            />
            {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
              const x = corner.includes('w') ? selection.x : selection.x + selection.width;
              const y = corner.includes('n') ? selection.y : selection.y + selection.height;
              return (
                <rect
                  key={corner}
                  className="mf-capture-handle"
                  x={x - 5}
                  y={y - 5}
                  width="10"
                  height="10"
                  onPointerDown={(event) => beginResize(event, corner)}
                />
              );
            })}
          </g>
        ) : null}
      </svg>

      {!selection ? <div className="mf-capture-instruction">拖拽选择截图区域</div> : null}

      {selection ? (
        <div
          className="mf-capture-toolbar"
          style={{ top: toolbarTop }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <span className="mf-capture-toolbar-label">截图</span>
          {toolItems.map((item) => (
            <button
              className={tool === item.value ? 'is-active' : ''}
              key={item.value}
              type="button"
              title={item.label}
              aria-label={item.label}
              onClick={() => setTool(item.value)}
            >
              {item.icon}
            </button>
          ))}
          <i />
          <button
            type="button"
            title={`线宽 ${strokeWidth}px`}
            aria-label={`线宽 ${strokeWidth}px`}
            onClick={() => setStrokeWidth((current) => (current === 2 ? 4 : current === 4 ? 6 : 2))}
          >
            <span className="mf-capture-stroke" style={{ borderTopWidth: strokeWidth }} />
          </button>
          {colors.map((item) => (
            <button
              className="mf-capture-color"
              key={item}
              type="button"
              title={item}
              aria-label={`颜色 ${item}`}
              data-active={color === item}
              style={{ background: item }}
              onClick={() => setColor(item)}
            />
          ))}
          <i />
          <button
            type="button"
            title="撤销"
            aria-label="撤销"
            disabled={!marks.length}
            onClick={undo}
          >
            <Undo2 />
          </button>
          <button
            type="button"
            title="重做"
            aria-label="重做"
            disabled={!redoMarks.length}
            onClick={redo}
          >
            <Redo2 />
          </button>
          <button type="button" title="清除" aria-label="清除" onClick={clear}>
            <X />
          </button>
          <i />
          <button
            type="button"
            title="复制截图"
            aria-label="复制截图"
            onClick={() => showToast('已模拟复制截图，不会写入剪贴板')}
          >
            <Copy />
          </button>
          <button
            type="button"
            title="保存截图"
            aria-label="保存截图"
            onClick={() => showToast('演示模式不会创建本地文件')}
          >
            <Download />
          </button>
          <button
            className="is-finish"
            type="button"
            aria-label="完成截图"
            title="完成截图"
            onClick={() => onComplete(selection)}
          >
            <Check />
          </button>
        </div>
      ) : null}
    </div>
  );
}
