import type { ScreenshotMark } from '@markfix/contracts';

type Region = { xCssPx: number; yCssPx: number };

let cachedImageSource: string | undefined;
let cachedImage: Promise<HTMLImageElement> | undefined;

const loadImage = (source: string): Promise<HTMLImageElement> => {
  if (source === cachedImageSource && cachedImage) return cachedImage;
  cachedImageSource = source;
  cachedImage = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      cachedImageSource = undefined;
      cachedImage = undefined;
      reject(new Error('The selected screenshot could not be decoded'));
    };
    image.src = source;
  });
  return cachedImage;
};

const encodePng = (canvas: HTMLCanvasElement): Promise<string> =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The screenshot could not be encoded'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('The screenshot could not be encoded'));
      reader.onerror = () =>
        reject(reader.error ?? new Error('The screenshot could not be encoded'));
      reader.readAsDataURL(blob);
    }, 'image/png');
  });

export const captureNoteLines = (
  note: string,
  measure: (value: string) => number,
  maxWidth: number,
  maxLines = 20,
): string[] => {
  const lines: string[] = [];
  for (const paragraph of note.trim().slice(0, 2000).split(/\r?\n/)) {
    let line = '';
    for (const character of paragraph) {
      const candidate = `${line}${character}`;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line.trimEnd());
        line = character.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  if (lines.length <= maxLines) return lines;
  const visible = lines.slice(0, maxLines);
  let lastLine = visible.at(-1) ?? '';
  while (lastLine && measure(`${lastLine}…`) > maxWidth) lastLine = lastLine.slice(0, -1);
  visible[maxLines - 1] = `${lastLine.trimEnd()}…`;
  return visible;
};

export const composeCaptureExport = async (dataUrl: string, note: string): Promise<string> => {
  const normalizedNote = note.trim();
  if (!normalizedNote) return dataUrl;
  const image = await loadImage(dataUrl);
  const canvas = document.createElement('canvas');
  const width = Math.max(image.naturalWidth, 360);
  const horizontalPadding = 24;
  const verticalPadding = 20;
  const fontSize = Math.max(16, Math.min(24, Math.round(width / 48)));
  const lineHeight = Math.round(fontSize * 1.5);
  canvas.width = width;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Screenshot canvas is unavailable');
  context.font = `${fontSize}px system-ui, sans-serif`;
  const lines = captureNoteLines(
    normalizedNote,
    (value) => context.measureText(value).width,
    width - horizontalPadding * 2,
  );
  canvas.height = image.naturalHeight + verticalPadding * 2 + lineHeight * lines.length;

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, Math.round((width - image.naturalWidth) / 2), 0);
  context.strokeStyle = '#e2e4e9';
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(0, image.naturalHeight + 0.5);
  context.lineTo(width, image.naturalHeight + 0.5);
  context.stroke();
  context.fillStyle = '#191a1d';
  context.font = `${fontSize}px system-ui, sans-serif`;
  context.textBaseline = 'top';
  lines.forEach((line, index) =>
    context.fillText(
      line,
      horizontalPadding,
      image.naturalHeight + verticalPadding + index * lineHeight,
    ),
  );
  return encodePng(canvas);
};

const arrowhead = (
  context: CanvasRenderingContext2D,
  start: { x: number; y: number },
  end: { x: number; y: number },
  size: number,
): void => {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - size * Math.cos(angle - Math.PI / 6),
    end.y - size * Math.sin(angle - Math.PI / 6),
  );
  context.lineTo(
    end.x - size * Math.cos(angle + Math.PI / 6),
    end.y - size * Math.sin(angle + Math.PI / 6),
  );
  context.closePath();
  context.fill();
};

export const composeScreenshot = async (
  sourceDataUrl: string,
  marks: readonly ScreenshotMark[],
  region: Region,
  captureScale: number,
): Promise<string> => {
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Screenshot canvas is unavailable');
  context.drawImage(image, 0, 0);

  const point = ({ x, y }: { x: number; y: number }) => ({
    x: (x - region.xCssPx) * captureScale,
    y: (y - region.yCssPx) * captureScale,
  });

  for (const mark of marks) {
    context.save();
    context.strokeStyle = mark.color;
    context.fillStyle = mark.color;
    context.lineWidth = mark.strokeWidth * captureScale;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    if (mark.type === 'rectangle' || mark.type === 'ellipse' || mark.type === 'mosaic') {
      const x = (mark.x - region.xCssPx) * captureScale;
      const y = (mark.y - region.yCssPx) * captureScale;
      const width = mark.width * captureScale;
      const height = mark.height * captureScale;
      if (mark.type === 'mosaic') {
        const clippedX = Math.max(0, x);
        const clippedY = Math.max(0, y);
        const clippedWidth = Math.min(canvas.width - clippedX, width - Math.max(0, -x));
        const clippedHeight = Math.min(canvas.height - clippedY, height - Math.max(0, -y));
        if (clippedWidth > 0 && clippedHeight > 0) {
          const pixelCanvas = document.createElement('canvas');
          pixelCanvas.width = Math.max(1, Math.ceil(clippedWidth / 12));
          pixelCanvas.height = Math.max(1, Math.ceil(clippedHeight / 12));
          const pixelContext = pixelCanvas.getContext('2d');
          if (pixelContext) {
            pixelContext.drawImage(
              canvas,
              clippedX,
              clippedY,
              clippedWidth,
              clippedHeight,
              0,
              0,
              pixelCanvas.width,
              pixelCanvas.height,
            );
            context.imageSmoothingEnabled = false;
            context.drawImage(
              pixelCanvas,
              0,
              0,
              pixelCanvas.width,
              pixelCanvas.height,
              clippedX,
              clippedY,
              clippedWidth,
              clippedHeight,
            );
            context.imageSmoothingEnabled = true;
          }
        }
      } else if (mark.type === 'ellipse') {
        context.beginPath();
        context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        context.stroke();
      } else {
        context.strokeRect(x, y, width, height);
      }
      context.restore();
      continue;
    }

    if (mark.type === 'arrow') {
      const start = point(mark.start);
      const end = point(mark.end);
      context.beginPath();
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
      context.stroke();
      arrowhead(context, start, end, (10 + mark.strokeWidth) * captureScale);
    } else if (mark.type === 'pen') {
      const [first, ...rest] = mark.points.map(point);
      if (first) {
        context.beginPath();
        context.moveTo(first.x, first.y);
        rest.forEach(({ x, y }) => context.lineTo(x, y));
        context.stroke();
      }
    } else if (mark.type === 'text') {
      const position = point(mark.position);
      context.font = `700 ${18 * captureScale}px system-ui, sans-serif`;
      context.strokeStyle = 'white';
      context.lineWidth = 3 * captureScale;
      context.strokeText(mark.text, position.x, position.y);
      context.fillText(mark.text, position.x, position.y);
    } else {
      const position = point(mark.position);
      const radius = 13 * captureScale;
      context.beginPath();
      context.arc(position.x, position.y, radius, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = 'white';
      context.lineWidth = 2 * captureScale;
      context.stroke();
      context.fillStyle = 'white';
      context.font = `700 ${12 * captureScale}px system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(String(mark.label), position.x, position.y);
    }
    context.restore();
  }

  return encodePng(canvas);
};
