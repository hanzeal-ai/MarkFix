import type { WebContents } from 'electron';
import {
  elementRuntimeEvidenceSchema,
  type ElementAnchor,
  type ElementRuntimeEvidence,
} from '@markfix/contracts';

type DebuggerMessage = Record<string, unknown> & { backendNodeId?: unknown };
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
      runtimeEvidence?: unknown;
      documentUrl?: unknown;
      framePath?: unknown;
    };
  };
};

type ScriptAsset = { url: string; sourceMapUrl?: string; hash?: string };

export const sanitizeRuntimeText = (value: string, limit = 500): string =>
  value
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[redacted-phone]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(
      /\b(token|secret|password|authorization|cookie|session)\s*[:=]\s*[^\s"'<>]+/gi,
      '$1=[redacted]',
    )
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);

const sanitizeResourceUrl = (value: string, base?: string): string => {
  try {
    const url = new URL(value, base);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString().slice(0, 4096);
  } catch {
    return sanitizeRuntimeText(value, 4096);
  }
};

const attributesToRecord = (attributes: string[] | undefined): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let index = 0; index < (attributes?.length ?? 0); index += 2) {
    const name = attributes?.[index];
    const value = attributes?.[index + 1];
    if (
      name &&
      value !== undefined &&
      ['id', 'name', 'role', 'type', 'aria-label', 'data-testid'].includes(name)
    ) {
      result[name] = sanitizeRuntimeText(value, 500);
    }
  }
  return result;
};

const escapeCssValue = (value: string): string =>
  value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');

const selectorFor = (tagName: string, attributes: Record<string, string>): string => {
  if (attributes.id && !attributes.id.includes('[redacted'))
    return `[id="${escapeCssValue(attributes.id)}"]`;
  for (const key of ['data-testid', 'name', 'aria-label']) {
    if (attributes[key] && !attributes[key].includes('[redacted'))
      return `${tagName}[${key}="${escapeCssValue(attributes[key])}"]`;
  }
  return tagName;
};

function collectElementRuntimeDetails(this: Element) {
  const redact = (input: unknown, limit = 500): string =>
    String(input ?? '')
      .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[redacted-email]')
      .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, '[redacted-phone]')
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(
        /\b(token|secret|password|authorization|cookie|session)\s*[:=]\s*[^\s"'<>]+/gi,
        '$1=[redacted]',
      )
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[redacted-token]')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limit);
  const recordedAttributes = (element: Element): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const name of [
      'id',
      'name',
      'role',
      'type',
      'aria-label',
      'aria-labelledby',
      'aria-describedby',
      'placeholder',
      'data-testid',
    ]) {
      const value = element.getAttribute(name);
      if (value) result[name] = redact(value, 500);
    }
    return result;
  };
  const safeSelectorValue = (value: string | null): string | undefined => {
    if (!value || value.length > 500) return undefined;
    const sanitized = redact(value, 500);
    return sanitized === value ? value : undefined;
  };
  const segmentFor = (element: Element): string => {
    let segment = element.tagName.toLowerCase();
    const id = safeSelectorValue(element.id);
    if (id) return `${segment}#${CSS.escape(id)}`;
    const testId = safeSelectorValue(element.getAttribute('data-testid'));
    if (testId) return `${segment}[data-testid="${CSS.escape(testId)}"]`;
    const parent = element.parentElement;
    if (parent) {
      const siblings = [...parent.children].filter((item) => item.tagName === element.tagName);
      if (siblings.length > 1) segment += `:nth-of-type(${siblings.indexOf(element) + 1})`;
    }
    return segment;
  };
  const selectorPathFor = (element: Element): string => {
    const id = safeSelectorValue(element.id);
    if (id) {
      const candidate = `#${CSS.escape(id)}`;
      if (element.ownerDocument.querySelectorAll(candidate).length === 1) return candidate;
    }
    for (const name of ['data-testid', 'name', 'aria-label']) {
      const value = safeSelectorValue(element.getAttribute(name));
      if (value) return `${element.tagName.toLowerCase()}[${name}="${CSS.escape(value)}"]`;
    }
    const segments: string[] = [];
    let current: Element | null = element;
    while (current && current !== element.ownerDocument.documentElement && segments.length < 8) {
      segments.unshift(segmentFor(current));
      current = current.parentElement;
    }
    return segments.join(' > ') || element.tagName.toLowerCase();
  };
  const selector = selectorPathFor(this);
  const selectorCandidates = new Set<string>([selector]);
  for (const [name, value] of Object.entries(recordedAttributes(this))) {
    if (!['id', 'data-testid', 'name', 'aria-label', 'role'].includes(name)) continue;
    if (value.includes('[redacted')) continue;
    const candidate =
      name === 'id'
        ? `#${CSS.escape(value)}`
        : `${this.tagName.toLowerCase()}[${name}="${CSS.escape(value)}"]`;
    selectorCandidates.add(candidate);
  }
  const classNames = [...this.classList]
    .map((value) => redact(value, 200))
    .filter((value) => Boolean(value) && !value.includes('[redacted'))
    .slice(0, 50);
  if (classNames.length > 0) {
    const classSelector = `${this.tagName.toLowerCase()}.${classNames
      .slice(0, 4)
      .map((value) => CSS.escape(value))
      .join('.')}`;
    selectorCandidates.add(classSelector);
  }
  const ancestorPathFor = (
    element: Element,
  ): Array<{
    tagName: string;
    selectorSegment: string;
    attributes: Record<string, string>;
  }> => {
    const result: Array<{
      tagName: string;
      selectorSegment: string;
      attributes: Record<string, string>;
    }> = [];
    let ancestor: Element | null = element;
    while (ancestor && result.length < 12) {
      result.unshift({
        tagName: ancestor.tagName.toLowerCase(),
        selectorSegment: segmentFor(ancestor),
        attributes: recordedAttributes(ancestor),
      });
      ancestor = ancestor.parentElement;
    }
    return result;
  };
  const ancestorPath = ancestorPathFor(this);
  const nearbyText = [
    this.previousElementSibling?.textContent,
    this.nextElementSibling?.textContent,
    this.parentElement?.textContent,
  ]
    .map((value) => redact(value, 500))
    .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
    .slice(0, 10);
  const labelText =
    this instanceof HTMLElement && 'labels' in this
      ? [...((this as HTMLInputElement).labels ?? [])]
          .map((label) => label.textContent)
          .filter(Boolean)
          .join(' ')
      : '';
  const accessibleName = redact(
    this.getAttribute('aria-label') || labelText || this.getAttribute('title') || '',
    500,
  );
  const clone = this.cloneNode(true) as Element;
  clone.querySelectorAll('script,style,noscript').forEach((element) => element.remove());
  [clone, ...clone.querySelectorAll('*')].forEach((element) => {
    [...element.attributes].forEach(({ name, value }) => {
      if (
        name.startsWith('on') ||
        (name.startsWith('data-') && name !== 'data-testid') ||
        /value|token|secret|password|auth|cookie|session|nonce|srcdoc/i.test(name)
      ) {
        element.removeAttribute(name);
        return;
      }
      if (name === 'href' || name === 'src' || name === 'action') {
        try {
          const safeUrl = new URL(value, this.ownerDocument.baseURI);
          safeUrl.search = '';
          safeUrl.hash = '';
          element.setAttribute(name, safeUrl.toString());
        } catch {
          element.removeAttribute(name);
        }
        return;
      }
      element.setAttribute(name, redact(value, 500));
    });
    if (element.matches('input,textarea,select,option')) element.textContent = '';
  });
  const walker = this.ownerDocument.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
  let textNode = walker.nextNode();
  while (textNode) {
    textNode.textContent = redact(textNode.textContent, 500);
    textNode = walker.nextNode();
  }
  const scripts = [...this.ownerDocument.scripts]
    .map((script) => {
      try {
        const url = new URL(script.src, this.ownerDocument.baseURI);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString().slice(0, 4096);
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, 200)
    .map((url) => ({ url }));
  const stylesheets = [
    ...this.ownerDocument.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"]'),
  ]
    .map((link) => {
      try {
        const url = new URL(link.href, this.ownerDocument.baseURI);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString().slice(0, 4096);
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, 100);
  const sourceMapHints = [
    ...this.ownerDocument.querySelectorAll<HTMLLinkElement>(
      'link[rel="sourcemap"],link[rel="sourceMap"]',
    ),
  ]
    .map((link) => {
      try {
        const url = new URL(link.href, this.ownerDocument.baseURI);
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString().slice(0, 4096);
      } catch {
        return '';
      }
    })
    .filter(Boolean)
    .slice(0, 200);
  const metadata: Record<string, string> = {};
  this.ownerDocument
    .querySelectorAll<HTMLMetaElement>('meta[name],meta[property]')
    .forEach((meta) => {
      const name = (meta.name || meta.getAttribute('property') || '').toLowerCase();
      if (!/(build|version|release|revision|commit|generator|application-name)/.test(name)) return;
      if (Object.keys(metadata).length >= 30) return;
      metadata[name.slice(0, 100)] = redact(meta.content, 1000);
    });
  const frameworkHints = new Set<string>();
  let componentHint:
    | {
        framework: 'react' | 'vue' | 'angular' | 'unknown';
        name?: string;
        sourceFile?: string;
        line?: number;
        column?: number;
        confidence: 'high' | 'medium' | 'low';
      }
    | undefined;
  try {
    const vueInstance = (this as Element & { __vueParentComponent?: Record<string, unknown> })
      .__vueParentComponent;
    if (vueInstance) {
      frameworkHints.add('vue');
      const type = vueInstance.type as
        { name?: unknown; __name?: unknown; __file?: unknown } | undefined;
      componentHint = {
        framework: 'vue',
        ...(redact(type?.name || type?.__name || '', 300)
          ? { name: redact(type?.name || type?.__name || '', 300) }
          : {}),
        ...(redact(type?.__file || '', 4096)
          ? { sourceFile: redact(type?.__file || '', 4096) }
          : {}),
        confidence: type?.__file ? 'high' : 'medium',
      };
    }
    const reactKey = Object.keys(this).find((key) => key.startsWith('__reactFiber$'));
    if (reactKey) {
      frameworkHints.add('react');
      let fiber = (this as unknown as Record<string, unknown>)[reactKey] as
        Record<string, unknown> | undefined;
      while (fiber && !componentHint) {
        const type = fiber.type as { displayName?: unknown; name?: unknown } | undefined;
        const source = fiber._debugSource as
          { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown } | undefined;
        const name = redact(type?.displayName || type?.name || '', 300);
        if (name || source?.fileName) {
          componentHint = {
            framework: 'react',
            ...(name ? { name } : {}),
            ...(redact(source?.fileName || '', 4096)
              ? { sourceFile: redact(source?.fileName || '', 4096) }
              : {}),
            ...(typeof source?.lineNumber === 'number' && source.lineNumber > 0
              ? { line: Math.floor(source.lineNumber) }
              : {}),
            ...(typeof source?.columnNumber === 'number' && source.columnNumber >= 0
              ? { column: Math.floor(source.columnNumber) }
              : {}),
            confidence: source?.fileName ? 'high' : 'low',
          };
        }
        fiber = fiber.return as Record<string, unknown> | undefined;
      }
    }
    const angularVersion = this.ownerDocument.documentElement.getAttribute('ng-version');
    if (angularVersion) {
      frameworkHints.add('angular');
      metadata['ng-version'] = redact(angularVersion, 100);
    }
  } catch {
    // Framework internals are optional and differ between production builds.
  }
  let buildId: string | undefined;
  try {
    const nextData = this.ownerDocument.querySelector('#__NEXT_DATA__')?.textContent;
    if (nextData) {
      const parsed = JSON.parse(nextData) as { buildId?: unknown };
      if (typeof parsed.buildId === 'string') {
        buildId = redact(parsed.buildId, 500);
        frameworkHints.add('nextjs');
      }
    }
  } catch {
    // Invalid embedded build metadata is ignored.
  }
  const framePath: string[] = [];
  try {
    let frameWindow: Window | null = this.ownerDocument.defaultView;
    while (frameWindow?.frameElement && framePath.length < 12) {
      framePath.unshift(segmentFor(frameWindow.frameElement));
      frameWindow = frameWindow.parent;
    }
  } catch {
    framePath.unshift('[cross-origin-frame]');
  }
  return {
    cssSelector: selector,
    textQuote: redact(this.textContent, 500),
    attributes: recordedAttributes(this),
    documentUrl: this.ownerDocument.location.href,
    framePath,
    runtimeEvidence: {
      schemaVersion: 1,
      selectorCandidates: [...selectorCandidates].slice(0, 20),
      classNames,
      accessibleName: accessibleName || undefined,
      sanitizedOuterHtml: redact(clone.outerHTML, 8000) || undefined,
      ancestorPath,
      nearbyText,
      componentHint,
      pageBuild: {
        scripts,
        stylesheets,
        sourceMapHints,
        metadata,
        frameworkHints: [...frameworkHints],
        buildId,
      },
    },
  };
}

export class CdpInspector {
  private state: 'DETACHED' | 'ATTACHING' | 'READY' | 'SELECTING' = 'DETACHED';
  private active = false;
  private readonly scriptAssets = new Map<string, ScriptAsset>();

  constructor(
    private readonly webContents: WebContents,
    private readonly onSelection: (anchor: ElementAnchor) => void,
    private readonly onFailure: (message: string) => void,
  ) {
    webContents.debugger.on('message', (_event, method, parameters) => {
      const payload = parameters as DebuggerMessage;
      if (method === 'Debugger.globalObjectCleared') {
        this.scriptAssets.clear();
        return;
      }
      if (method === 'Debugger.scriptParsed') {
        this.rememberScriptAsset(payload);
        return;
      }
      if (method === 'Overlay.inspectNodeRequested') void this.captureSelection(payload);
    });
    webContents.debugger.on('detach', (_event, reason) => {
      this.active = false;
      this.state = 'DETACHED';
      this.onFailure(`Element inspection stopped: ${reason}`);
    });
  }

  async start(selecting = true): Promise<void> {
    this.active = true;
    try {
      if (!this.webContents.debugger.isAttached()) {
        this.state = 'ATTACHING';
        this.webContents.debugger.attach('1.3');
      }
      await this.webContents.debugger.sendCommand('DOM.enable');
      await this.webContents.debugger.sendCommand('Debugger.enable');
      await this.webContents.debugger.sendCommand('Overlay.enable');
      if (selecting) {
        await this.enableInspectMode();
        this.state = 'SELECTING';
      } else await this.pauseSelection();
    } catch (error) {
      this.active = false;
      this.state = 'READY';
      this.onFailure(error instanceof Error ? error.message : 'Unable to inspect this page');
    }
  }

  private rememberScriptAsset(payload: DebuggerMessage): void {
    const scriptId = typeof payload.scriptId === 'string' ? payload.scriptId : undefined;
    const rawUrl = typeof payload.url === 'string' ? payload.url : '';
    const url = rawUrl ? sanitizeResourceUrl(rawUrl) : '';
    const sourceMapUrl =
      typeof payload.sourceMapURL === 'string' && payload.sourceMapURL
        ? sanitizeResourceUrl(payload.sourceMapURL, rawUrl || undefined)
        : undefined;
    const hash = typeof payload.hash === 'string' && payload.hash ? payload.hash : undefined;
    if (!scriptId || (!url && !sourceMapUrl)) return;
    this.scriptAssets.set(scriptId, {
      url,
      ...(sourceMapUrl ? { sourceMapUrl } : {}),
      ...(hash ? { hash: hash.slice(0, 256) } : {}),
    });
    if (this.scriptAssets.size > 200) {
      const oldestKey = this.scriptAssets.keys().next().value;
      if (typeof oldestKey === 'string') this.scriptAssets.delete(oldestKey);
    }
  }

  async pauseSelection(): Promise<void> {
    if (!this.webContents.debugger.isAttached()) return;
    await this.webContents.debugger.sendCommand('Overlay.setInspectMode', {
      mode: 'none',
      highlightConfig: {},
    });
    await this.webContents.debugger.sendCommand('Overlay.hideHighlight');
    this.state = 'READY';
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

  async selectAt(x: number, y: number): Promise<void> {
    if (!this.active || this.state !== 'READY') return;
    try {
      const node = await this.webContents.debugger.sendCommand('DOM.getNodeForLocation', {
        x,
        y,
        includeUserAgentShadowDOM: false,
      });
      if (this.active) await this.captureSelection(node);
    } catch (error) {
      this.onFailure(error instanceof Error ? error.message : 'Unable to select this element');
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
      let attributes = attributesToRecord(description.node.attributes);
      let textQuote = sanitizeRuntimeText(
        html.outerHTML
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      let cssSelector = selectorFor(tagName, attributes);
      let documentUrl = this.webContents.getURL();
      let framePath: string[] = [];
      let runtimeEvidence: ElementRuntimeEvidence = {
        schemaVersion: 1,
        selectorCandidates: [cssSelector],
        classNames: [],
        ancestorPath: [],
        nearbyText: [],
        pageBuild: {
          scripts: [],
          stylesheets: [],
          sourceMapHints: [],
          metadata: {},
          frameworkHints: [],
        },
      };
      const resolved = (await this.webContents.debugger.sendCommand('DOM.resolveNode', {
        backendNodeId: parameters.backendNodeId,
      })) as ResolvedNode;
      if (resolved.object?.objectId) {
        const runtimeDetails = (await this.webContents.debugger.sendCommand(
          'Runtime.callFunctionOn',
          {
            objectId: resolved.object.objectId,
            returnByValue: true,
            functionDeclaration: collectElementRuntimeDetails.toString(),
          },
        )) as RuntimeDetails;
        const value = runtimeDetails.result?.value;
        if (typeof value?.cssSelector === 'string' && value.cssSelector)
          cssSelector = value.cssSelector;
        if (typeof value?.textQuote === 'string') textQuote = value.textQuote;
        if (value?.attributes && typeof value.attributes === 'object')
          attributes = value.attributes as Record<string, string>;
        if (typeof value?.documentUrl === 'string') documentUrl = value.documentUrl;
        if (
          Array.isArray(value?.framePath) &&
          value.framePath.every((entry) => typeof entry === 'string')
        )
          framePath = value.framePath.slice(0, 12);
        const parsedEvidence = elementRuntimeEvidenceSchema.safeParse(value?.runtimeEvidence);
        if (parsedEvidence.success) runtimeEvidence = parsedEvidence.data;
      }
      const parsedScripts = [...this.scriptAssets.values()];
      const scriptKeys = new Set(
        runtimeEvidence.pageBuild.scripts.map(
          ({ url, sourceMapUrl }) => `${url}\n${sourceMapUrl ?? ''}`,
        ),
      );
      const scripts = [...runtimeEvidence.pageBuild.scripts];
      parsedScripts.forEach((script) => {
        const key = `${script.url}\n${script.sourceMapUrl ?? ''}`;
        if (!scriptKeys.has(key) && scripts.length < 200) {
          scriptKeys.add(key);
          scripts.push(script);
        }
      });
      const sourceMapHints = [
        ...new Set([
          ...runtimeEvidence.pageBuild.sourceMapHints,
          ...scripts.flatMap(({ sourceMapUrl }) => (sourceMapUrl ? [sourceMapUrl] : [])),
        ]),
      ].slice(0, 200);
      runtimeEvidence = {
        ...runtimeEvidence,
        selectorCandidates: [
          ...new Set([cssSelector, ...runtimeEvidence.selectorCandidates]),
        ].slice(0, 20),
        pageBuild: {
          ...runtimeEvidence.pageBuild,
          scripts,
          sourceMapHints,
        },
      };
      const anchor: ElementAnchor = {
        kind: 'element',
        cssSelector,
        textQuote,
        tagName,
        attributes,
        documentUrl,
        framePath,
        quadsCssPx: quads.quads.filter((quad) => quad.length === 8),
        runtimeEvidence,
      };
      await this.webContents.debugger.sendCommand('Overlay.setInspectMode', {
        mode: 'none',
        highlightConfig: {},
      });
      await this.webContents.debugger.sendCommand('Overlay.hideHighlight');
      this.state = 'READY';
      this.onSelection(anchor);
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
        showInfo: false,
        showStyles: false,
        contentColor: { r: 91, g: 82, b: 232, a: 0 },
        borderColor: { r: 91, g: 82, b: 232, a: 0.95 },
        showExtensionLines: false,
      },
    });
  }
}
