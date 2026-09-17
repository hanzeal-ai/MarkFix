import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
const image = vi.hoisted(() => ({
  getSize: () => ({ width: 800, height: 600 }),
  toPNG: () => Buffer.from('snapshot'),
  toDataURL: () => 'data:image/png;base64,c25hcHNob3Q=',
  crop: vi.fn().mockReturnValue({ toDataURL: () => 'data:image/png;base64,Y3JvcA==' }),
}));
vi.mock('electron', () => ({ nativeImage: { createFromDataURL: () => image } }));
import { CaptureService } from '../src/main/capture-service';
const region = {
  mode: 'region' as const,
  anchor: {
    kind: 'region' as const,
    xCssPx: 20,
    yCssPx: 30,
    widthCssPx: 100,
    heightCssPx: 80,
    documentUrl: 'https://example.test',
    scrollXCssPx: 0,
    scrollYCssPx: 0,
  },
};
function fixture() {
  const capturePage = vi.fn().mockResolvedValue(image);
  const contents = {
    capturePage,
    executeJavaScript: vi.fn().mockResolvedValue({ x: 0, y: 0, deviceScaleFactor: 1 }),
    getURL: () => 'https://example.test',
    getTitle: () => 'Original page',
  };
  const service = new CaptureService(
    contents as unknown as WebContents,
    () => ({ width: 800, height: 600 }),
    () => 'revision',
    async () => {},
  );
  return { service, capturePage };
}
describe('capture mode snapshot', () => {
  it('crops repeated selections from the entry frame without recapturing the live website', async () => {
    const { service, capturePage } = fixture();
    const snapshot = await service.freeze();
    capturePage.mockRejectedValue(new Error('Live page changed'));
    expect(await service.capture({ mode: 'visible' })).toEqual(snapshot);
    expect(await service.capture(region)).toMatchObject({
      mode: 'region',
      originCssPx: { x: 20, y: 30 },
      widthCssPx: 100,
      heightCssPx: 80,
      pageTitle: 'Original page',
    });
    await service.capture(region);
    expect(capturePage).toHaveBeenCalledTimes(1);
  });
  it('releases the frame when leaving capture and takes a fresh frame on reentry', async () => {
    const { service, capturePage } = fixture();
    await service.freeze();
    service.clearSnapshot();
    await service.freeze();
    expect(capturePage).toHaveBeenCalledTimes(2);
  });
  it('does not publish a snapshot whose capture was canceled', async () => {
    const { service, capturePage } = fixture();
    let finish!: (value: typeof image) => void;
    capturePage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = service.freeze();
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    service.clearSnapshot();
    finish(image);
    await expect(pending).rejects.toThrow('Capture was canceled');
    await service.capture({ mode: 'visible' });
    expect(capturePage).toHaveBeenCalledTimes(2);
  });
});
