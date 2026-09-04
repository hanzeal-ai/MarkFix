import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { CdpInspector } from '../src/main/cdp-inspector.js';

describe('CdpInspector', () => {
  it('leaves inspect mode without triggering Chromium highlight validation', async () => {
    let messageListener:
      | ((_event: unknown, method: string, parameters: { backendNodeId?: unknown }) => void)
      | undefined;
    const sendCommand = vi.fn(async (method: string, parameters?: Record<string, unknown>) => {
      if (method === 'Overlay.setInspectMode' && !parameters?.highlightConfig) {
        throw new Error('Internal error: highlight configuration parameter is missing');
      }
      if (method === 'DOM.describeNode') {
        return {
          node: {
            backendNodeId: 7,
            localName: 'button',
            nodeName: 'BUTTON',
            attributes: ['id', 'submit'],
          },
        };
      }
      if (method === 'DOM.getOuterHTML') return { outerHTML: '<button>Submit</button>' };
      if (method === 'DOM.getContentQuads') return { quads: [[10, 20, 110, 20, 110, 60, 10, 60]] };
      return {};
    });
    const webContents = {
      debugger: {
        on: vi.fn((event: string, listener: typeof messageListener) => {
          if (event === 'message') messageListener = listener;
        }),
        isAttached: vi.fn(() => false),
        attach: vi.fn(),
        sendCommand,
      },
      getURL: vi.fn(() => 'https://example.com'),
    } as unknown as WebContents;
    const onSelection = vi.fn();
    const onFailure = vi.fn();
    const inspector = new CdpInspector(webContents, onSelection, onFailure);

    await inspector.start();
    messageListener?.(undefined, 'Overlay.inspectNodeRequested', { backendNodeId: 7 });
    await vi.waitFor(() => expect(onSelection).toHaveBeenCalledOnce());

    expect(onFailure).not.toHaveBeenCalled();
    expect(sendCommand).toHaveBeenCalledWith('Overlay.setInspectMode', {
      mode: 'none',
      highlightConfig: {},
    });
    expect(sendCommand).toHaveBeenCalledWith('Overlay.hideHighlight');
  });
});
