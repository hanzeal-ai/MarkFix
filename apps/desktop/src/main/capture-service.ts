import { nativeImage, type NativeImage, type WebContents } from 'electron';
import type { CaptureContext, CaptureRequest } from '@markfix/contracts';
import { boundFullPage, cropForQuads, type Rectangle } from './capture-policy.js';

type CaptureResult = CaptureContext & {
  dataUrl: string;
  pageUrl: string;
  pageTitle: string;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  deviceScaleFactor: number;
};

type LayoutMetrics = { cssContentSize?: { width: number; height: number } };

export class CaptureService {
  constructor(
    private readonly webContents: WebContents,
    private readonly getViewport: () => { width: number; height: number },
    private readonly getPageRevision: () => string,
    private readonly setOverlayHidden: (hidden: boolean) => Promise<void>,
  ) {}

  async capture(request: CaptureRequest): Promise<CaptureResult> {
    const revision = this.getPageRevision();
    const viewport = this.getViewport();
    const scroll = (await this.webContents.executeJavaScript(
      '({ x: window.scrollX, y: window.scrollY, deviceScaleFactor: window.devicePixelRatio })',
      true,
    )) as { x: number; y: number; deviceScaleFactor: number };
    await this.setOverlayHidden(true);
    let image: NativeImage;
    let mode = request.mode;
    let originCssPx = { x: 0, y: 0 };
    let capturedCssSize = viewport;
    let truncated = false;
    let warning: string | undefined;
    try {
      if (request.mode === 'full-page') {
        try {
          const fullPage = await this.captureFullPage();
          image = fullPage.image;
          capturedCssSize = { width: fullPage.widthCssPx, height: fullPage.heightCssPx };
          truncated = fullPage.truncated;
          originCssPx = { x: -scroll.x, y: -scroll.y };
          if (truncated) warning = 'The page exceeded capture limits and was truncated.';
        } catch (error) {
          image = await this.webContents.capturePage();
          mode = 'visible';
          capturedCssSize = viewport;
          warning = `Full-page capture fell back to the visible area: ${this.message(error)}`;
        }
      } else {
        image = await this.webContents.capturePage();
        if (request.mode === 'element' || request.mode === 'region') {
          const crop =
            request.mode === 'element'
              ? cropForQuads(
                  request.anchor?.kind === 'element' ? request.anchor.quadsCssPx : [],
                  viewport,
                )
              : request.anchor?.kind === 'region'
                ? {
                    x: request.anchor.xCssPx,
                    y: request.anchor.yCssPx,
                    width: request.anchor.widthCssPx,
                    height: request.anchor.heightCssPx,
                  }
                : undefined;
          if (crop) {
            const scale = image.getSize().width / viewport.width;
            image = image.crop(this.pixelRectangle(crop, scale, image));
            originCssPx = { x: crop.x, y: crop.y };
            capturedCssSize = { width: crop.width, height: crop.height };
          } else {
            mode = 'visible';
            capturedCssSize = viewport;
            warning = `${request.mode === 'element' ? 'Element' : 'Region'} geometry was unavailable; captured the visible area instead.`;
          }
        }
      }
    } finally {
      await this.setOverlayHidden(false);
    }
    if (revision !== this.getPageRevision()) throw new Error('Page changed during capture');
    const size = image.getSize();
    const png = image.toPNG();
    if (png.byteLength > 20 * 1024 * 1024)
      throw new Error('Capture exceeds the 20 MB safety limit');
    const captureScale = size.width / Math.max(1, capturedCssSize.width);
    const widthCssPx = size.width / captureScale;
    const heightCssPx = size.height / captureScale;
    return {
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      mode,
      imageWidthPx: size.width,
      imageHeightPx: size.height,
      widthCssPx,
      heightCssPx,
      originCssPx,
      captureScale,
      truncated,
      ...(warning ? { warning } : {}),
      pageUrl: this.webContents.getURL(),
      pageTitle: this.webContents.getTitle(),
      viewportWidthCssPx: viewport.width,
      viewportHeightCssPx: viewport.height,
      deviceScaleFactor: scroll.deviceScaleFactor,
    };
  }

  private async captureFullPage(): Promise<{
    image: NativeImage;
    truncated: boolean;
    widthCssPx: number;
    heightCssPx: number;
  }> {
    if (!this.webContents.debugger.isAttached()) this.webContents.debugger.attach('1.3');
    await this.webContents.debugger.sendCommand('Page.enable');
    const layout = (await this.webContents.debugger.sendCommand(
      'Page.getLayoutMetrics',
    )) as LayoutMetrics;
    if (!layout.cssContentSize) throw new Error('Page dimensions are unavailable');
    const bounded = boundFullPage(layout.cssContentSize.width, layout.cssContentSize.height);
    const screenshot = (await this.webContents.debugger.sendCommand('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width: bounded.width, height: bounded.height, scale: 1 },
    })) as { data: string };
    return {
      image: nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64')),
      truncated: bounded.truncated,
      widthCssPx: bounded.width,
      heightCssPx: bounded.height,
    };
  }

  private pixelRectangle(crop: Rectangle, scale: number, image: NativeImage): Rectangle {
    const size = image.getSize();
    const x = Math.max(0, Math.floor(crop.x * scale));
    const y = Math.max(0, Math.floor(crop.y * scale));
    return {
      x,
      y,
      width: Math.min(size.width - x, Math.max(1, Math.ceil(crop.width * scale))),
      height: Math.min(size.height - y, Math.max(1, Math.ceil(crop.height * scale))),
    };
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'capture unavailable';
  }
}
