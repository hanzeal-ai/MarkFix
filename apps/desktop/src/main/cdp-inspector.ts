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
type ResolvedNode = { object?: { objectId?: string } };
type RuntimeDetails = {
  result?: {
    value?: {
      cssSelector?: unknown;
      textQuote?: unknown;
      attributes?: unknown;
    };
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
  private active = false;

  constructor(
    private readonly webContents: WebContents,
    private readonly onSelection: (anchor: ElementAnchor) => void,
    private readonly onFailure: (message: string) => void,
  ) {
    webContents.debugger.on('message', (_event, method, parameters) => {
      if (method === 'Overlay.inspectNodeRequested') void this.captureSelection(parameters);
    });
    webContents.debugger.on('detach', (_event, reason) => {
      this.active = false;
      this.state = 'DETACHED';
      this.onFailure(`Element inspection stopped: ${reason}`);
    });
  }

  async start(): Promise<void> {
    this.active = true;
    try {
      if (!this.webContents.debugger.isAttached()) {
        this.state = 'ATTACHING';
        this.webContents.debugger.attach('1.3');
      }
      await this.webContents.debugger.sendCommand('DOM.enable');
      await this.webContents.debugger.sendCommand('Overlay.enable');
      await this.enableInspectMode();
      this.state = 'SELECTING';
    } catch (error) {
      this.active = false;
      this.state = 'READY';
      this.onFailure(error instanceof Error ? error.message : 'Unable to inspect this page');
    }
  }

  async stop(): Promise<void> {
    this.active = false;
    if (!this.webContents.debugger.isAttached()) return;
    await this.webContents.debugger
      .sendCommand('Overlay.setInspectMode', { mode: 'none', highlightConfig: {} })
      .catch(() => undefined);
    await this.webContents.debugger.sendCommand('Overlay.hideHighlight').catch(() => undefined);
    this.state = 'READY';
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
      let attributes = attributesToRecord(description.node.attributes);
      let textQuote = html.outerHTML
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500);
      let cssSelector = selectorFor(tagName, attributes);
      const resolved = (await this.webContents.debugger.sendCommand('DOM.resolveNode', {
        backendNodeId: parameters.backendNodeId,
      })) as ResolvedNode;
      if (resolved.object?.objectId) {
        const runtimeDetails = (await this.webContents.debugger.sendCommand(
          'Runtime.callFunctionOn',
          {
            objectId: resolved.object.objectId,
            returnByValue: true,
            functionDeclaration: `function () {
              const recorded = {};
              for (const name of ['id', 'name', 'role', 'type', 'aria-label', 'data-testid']) {
                const value = this.getAttribute(name);
                if (value) recorded[name] = value.slice(0, 200);
              }
              const selector = (() => {
                if (this.id) {
                  const candidate = '#' + CSS.escape(this.id);
                  if (this.ownerDocument.querySelectorAll(candidate).length === 1) return candidate;
                }
                for (const name of ['data-testid', 'name', 'aria-label']) {
                  const value = this.getAttribute(name);
                  if (value) return this.tagName.toLowerCase() + '[' + name + '="' + CSS.escape(value) + '"]';
                }
                const segments = [];
                let current = this;
                while (current && current !== this.ownerDocument.documentElement && segments.length < 5) {
                  let segment = current.tagName.toLowerCase();
                  const parent = current.parentElement;
                  if (parent) {
                    const siblings = [...parent.children].filter((item) => item.tagName === current.tagName);
                    if (siblings.length > 1) segment += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
                  }
                  segments.unshift(segment);
                  current = parent;
                }
                return segments.join(' > ') || this.tagName.toLowerCase();
              })();
              return {
                cssSelector: selector,
                textQuote: (this.textContent || '').trim().replace(/\\s+/g, ' ').slice(0, 500),
                attributes: recorded,
              };
            }`,
          },
        )) as RuntimeDetails;
        const value = runtimeDetails.result?.value;
        if (typeof value?.cssSelector === 'string' && value.cssSelector)
          cssSelector = value.cssSelector;
        if (typeof value?.textQuote === 'string') textQuote = value.textQuote;
        if (value?.attributes && typeof value.attributes === 'object')
          attributes = value.attributes as Record<string, string>;
      }
      const anchor: ElementAnchor = {
        kind: 'element',
        cssSelector,
        textQuote,
        tagName,
        attributes,
        documentUrl: this.webContents.getURL(),
        framePath: [],
        quadsCssPx: quads.quads.filter((quad) => quad.length === 8),
      };
      await this.webContents.debugger.sendCommand('Overlay.setInspectMode', {
        mode: 'none',
        highlightConfig: {},
      });
      await this.webContents.debugger.sendCommand('Overlay.hideHighlight');
      this.state = 'READY';
      this.onSelection(anchor);
      if (this.active) {
        await this.enableInspectMode();
        this.state = 'SELECTING';
      }
    } catch (error) {
      this.onFailure(error instanceof Error ? error.message : 'Element details are unavailable');
    }
  }

  detach(): void {
    this.active = false;
    if (this.webContents.debugger.isAttached()) this.webContents.debugger.detach();
    this.state = 'DETACHED';
  }

  private enableInspectMode(): Promise<unknown> {
    return this.webContents.debugger.sendCommand('Overlay.setInspectMode', {
      mode: 'searchForNode',
      highlightConfig: {
        showInfo: true,
        showStyles: false,
        contentColor: { r: 91, g: 82, b: 232, a: 0 },
        borderColor: { r: 91, g: 82, b: 232, a: 0.95 },
        showExtensionLines: false,
      },
    });
  }
}
