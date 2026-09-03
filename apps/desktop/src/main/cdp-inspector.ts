import type { WebContents } from 'electron';
import type { ElementAnchor } from '@markfix/contracts';

type DebuggerMessage = { backendNodeId?: unknown };
type NodeDescription = {
  node: {
    backendNodeId: number;
    localName?: string;
    nodeName: string;
    attributes?: string[];
  };
};

const attributesToRecord = (attributes: string[] | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let index = 0; index < (attributes?.length ?? 0); index += 2) {
    const name = attributes?.[index];
    const value = attributes?.[index + 1];
    if (
      name &&
      value !== undefined &&
      ['id', 'name', 'role', 'aria-label', 'data-testid'].includes(name)
    ) {
      result[name] = value;
    }
  }
  return result;
};

const escapeCssValue = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

const selectorFor = (tagName: string, attributes: Record<string, string>): string => {
  if (attributes.id) return `[id="${escapeCssValue(attributes.id)}"]`;
  for (const key of ['data-testid', 'name', 'aria-label']) {
    if (attributes[key]) return `${tagName}[${key}="${escapeCssValue(attributes[key])}"]`;
  }
  return tagName;
};

export class CdpInspector {
  private state: 'DETACHED' | 'ATTACHING' | 'READY' | 'SELECTING' = 'DETACHED';

  constructor(
    private readonly webContents: WebContents,
    private readonly onSelection: (anchor: ElementAnchor) => void,
    private readonly onFailure: (message: string) => void,
  ) {
    webContents.debugger.on('message', (_event, method, parameters) => {
      if (method === 'Overlay.inspectNodeRequested') void this.captureSelection(parameters);
    });
    webContents.debugger.on('detach', (_event, reason) => {
      this.state = 'DETACHED';
      this.onFailure(`Element inspection stopped: ${reason}`);
    });
  }

  async start(): Promise<void> {
    try {
      if (!this.webContents.debugger.isAttached()) {
        this.state = 'ATTACHING';
        this.webContents.debugger.attach('1.3');
      }
      await this.webContents.debugger.sendCommand('DOM.enable');
      await this.webContents.debugger.sendCommand('Overlay.enable');
      await this.webContents.debugger.sendCommand('Overlay.setInspectMode', {
        mode: 'searchForNode',
        highlightConfig: {
          showInfo: false,
          showStyles: false,
          contentColor: { r: 117, g: 255, b: 117, a: 0.22 },
          borderColor: { r: 36, g: 74, b: 58, a: 0.95 },
          showExtensionLines: false,
        },
      });
      this.state = 'SELECTING';
    } catch (error) {
      this.state = 'READY';
      this.onFailure(error instanceof Error ? error.message : 'Unable to inspect this page');
    }
  }

  private async captureSelection(parameters: DebuggerMessage): Promise<void> {
    if (typeof parameters.backendNodeId !== 'number') return;
    try {
      const description = (await this.webContents.debugger.sendCommand('DOM.describeNode', {
        backendNodeId: parameters.backendNodeId,
        depth: 0,
        pierce: true,
      })) as NodeDescription;
      const html = (await this.webContents.debugger.sendCommand('DOM.getOuterHTML', {
        backendNodeId: parameters.backendNodeId,
      })) as { outerHTML: string };
      const quads = (await this.webContents.debugger.sendCommand('DOM.getContentQuads', {
        backendNodeId: parameters.backendNodeId,
      })) as { quads: number[][] };
      const tagName = (description.node.localName ?? description.node.nodeName).toLocaleLowerCase();
      const attributes = attributesToRecord(description.node.attributes);
      const textQuote = html.outerHTML
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
      const anchor: ElementAnchor = {
        kind: 'element',
        cssSelector: selectorFor(tagName, attributes),
        textQuote,
        tagName,
        attributes,
        documentUrl: this.webContents.getURL(),
        framePath: [],
        quadsCssPx: quads.quads.filter((quad) => quad.length === 8),
      };
      await this.webContents.debugger.sendCommand('Overlay.setInspectMode', { mode: 'none' });
      this.state = 'READY';
      this.onSelection(anchor);
    } catch (error) {
      this.onFailure(error instanceof Error ? error.message : 'Element details are unavailable');
    }
  }

  detach(): void {
    if (this.webContents.debugger.isAttached()) this.webContents.debugger.detach();
    this.state = 'DETACHED';
  }
}
