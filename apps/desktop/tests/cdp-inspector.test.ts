import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { CdpInspector } from '../src/main/cdp-inspector.js';

describe('CdpInspector', () => {
  it('re-arms element inspection after every selection without a page tint', async () => {
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
      if (method === 'DOM.resolveNode') return { object: { objectId: 'button-7' } };
      if (method === 'Runtime.callFunctionOn') {
        return {
          result: {
            value: {
              cssSelector: 'main > button:nth-of-type(2)',
              textQuote: 'Submit',
              attributes: { id: 'submit' },
            },
          },
        };
      }
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
    messageListener?.(undefined, 'Overlay.inspectNodeRequested', { backendNodeId: 8 });
    await vi.waitFor(() => expect(onSelection).toHaveBeenCalledTimes(2));

    expect(onFailure).not.toHaveBeenCalled();
    expect(onSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({ cssSelector: 'main > button:nth-of-type(2)', textQuote: 'Submit' }),
    );
    expect(sendCommand).toHaveBeenCalledWith('Overlay.setInspectMode', {
      mode: 'none',
      highlightConfig: {},
    });
    expect(sendCommand).toHaveBeenCalledWith('Overlay.hideHighlight');
    const inspectCalls = sendCommand.mock.calls.filter(
      ([method, parameters]) =>
        method === 'Overlay.setInspectMode' && parameters?.mode === 'searchForNode',
    );
    expect(inspectCalls).toHaveLength(3);
    expect(inspectCalls[0]?.[1]).toMatchObject({
      highlightConfig: { contentColor: { r: 91, g: 82, b: 232, a: 0 } },
    });
  });
});
