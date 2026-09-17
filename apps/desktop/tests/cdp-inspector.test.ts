import { describe, expect, it, vi } from 'vitest';
import type { WebContents } from 'electron';
import { CdpInspector, sanitizeRuntimeText } from '../src/main/cdp-inspector.js';

describe('CdpInspector', () => {
  it('pauses inspection for inline input without an inspector tooltip', async () => {
    let messageListener:
      ((_event: unknown, method: string, parameters: Record<string, unknown>) => void) | undefined;
    const sendCommand = vi.fn(async (method: string, parameters?: Record<string, unknown>) => {
      if (method === 'Overlay.setInspectMode' && !parameters?.highlightConfig) {
        throw new Error('Internal error: highlight configuration parameter is missing');
      }
      if (method === 'DOM.getNodeForLocation') return { backendNodeId: 8 };
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
              documentUrl: 'https://example.com/form',
              framePath: ['iframe#checkout'],
              runtimeEvidence: {
                schemaVersion: 1,
                selectorCandidates: ['main > button:nth-of-type(2)', '#submit'],
                classNames: ['primary-action'],
                accessibleName: 'Submit order',
                sanitizedOuterHtml: '<button id="submit">Submit</button>',
                ancestorPath: [
                  { tagName: 'main', selectorSegment: 'main', attributes: {} },
                  {
                    tagName: 'button',
                    selectorSegment: 'button:nth-of-type(2)',
                    attributes: { id: 'submit' },
                  },
                ],
                nearbyText: ['Cancel'],
                componentHint: {
                  framework: 'react',
                  name: 'CheckoutButton',
                  sourceFile: 'src/CheckoutButton.tsx',
                  line: 18,
                  column: 4,
                  confidence: 'high',
                },
                pageBuild: {
                  scripts: [{ url: 'https://example.com/app.js' }],
                  stylesheets: ['https://example.com/app.css'],
                  sourceMapHints: [],
                  metadata: { version: '2026.09.07' },
                  frameworkHints: ['react'],
                  buildId: 'build-7',
                },
              },
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
    messageListener?.(undefined, 'Debugger.scriptParsed', {
      scriptId: 'script-1',
      url: 'https://example.com/chunk.js',
      sourceMapURL: 'https://example.com/chunk.js.map',
      hash: 'abc123',
    });
    messageListener?.(undefined, 'Overlay.inspectNodeRequested', { backendNodeId: 7 });
    await vi.waitFor(() => expect(onSelection).toHaveBeenCalledOnce());
    await inspector.selectAt(20, 40);
    expect(sendCommand).toHaveBeenCalledWith('DOM.getNodeForLocation', {
      x: 20,
      y: 40,
      includeUserAgentShadowDOM: false,
    });
    await vi.waitFor(() => expect(onSelection).toHaveBeenCalledTimes(2));

    expect(onFailure).not.toHaveBeenCalled();
    expect(onSelection).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cssSelector: 'main > button:nth-of-type(2)',
        textQuote: 'Submit',
        documentUrl: 'https://example.com/form',
        framePath: ['iframe#checkout'],
        runtimeEvidence: expect.objectContaining({
          selectorCandidates: ['main > button:nth-of-type(2)', '#submit'],
          componentHint: expect.objectContaining({ name: 'CheckoutButton' }),
          pageBuild: expect.objectContaining({
            scripts: [
              { url: 'https://example.com/app.js' },
              {
                url: 'https://example.com/chunk.js',
                sourceMapUrl: 'https://example.com/chunk.js.map',
                hash: 'abc123',
              },
            ],
            sourceMapHints: ['https://example.com/chunk.js.map'],
          }),
        }),
      }),
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
    expect(inspectCalls).toHaveLength(1);
    expect(inspectCalls[0]?.[1]).toMatchObject({
      highlightConfig: { showInfo: false, contentColor: { r: 91, g: 82, b: 232, a: 0 } },
    });
  });

  it('redacts common secrets and personal identifiers from runtime text', () => {
    expect(
      sanitizeRuntimeText(
        '联系 dev@example.com，手机 13812345678，Authorization: abcdef token=super-secret',
      ),
    ).toBe(
      '联系 [redacted-email]，手机 [redacted-phone]，Authorization=[redacted] token=[redacted]',
    );
  });
});
