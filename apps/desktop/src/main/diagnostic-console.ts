import {
  diagnosticBody,
  diagnosticHeaders,
  sanitizeDiagnosticValue,
  textResponse,
} from './diagnostic-payload.js';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type { DiagnosticEvidence } from '@markfix/contracts';

type RemoteObject = {
  type?: string;
  objectId?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  preview?: { properties?: Array<{ name?: string; value?: string }> };
};

type NetworkRequest = {
  method: string;
  url: string;
  startedAt: number;
  resourceType?: string;
  pageUrl: string;
  pageRevision: string;
  headers: Record<string, string>;
  body?: string;
  bodyState: 'captured' | 'empty' | 'truncated' | 'unavailable' | 'omitted';
  bodyPromise?: Promise<void>;
  responseHeaders?: Record<string, string>;
  response?: {
    status: number;
    statusText: string;
    headers: Record<string, string>;
    mimeType: string;
  };
};

type CurlRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
  followRedirects: boolean;
};

const sensitiveName = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i;
const sensitiveQueryName = /(token|secret|password|passwd|api[_-]?key|session|auth)/i;
const maximumEntries = 500;
const maximumOutputBytes = 64 * 1024;

export const redactDiagnosticText = (value: string): string =>
  sanitizeDiagnosticValue(value)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/\b(authorization|cookie|set-cookie|x-api-key)\s*:\s*([^\r\n'"]+)/gi, '$1: [REDACTED]')
    .slice(0, 20_000);

export const redactDiagnosticUrl = (value: string): string => {
  try {
    const url = new URL(value);
    if (url.username) url.username = '[REDACTED]';
    if (url.password) url.password = '[REDACTED]';
    for (const name of [...url.searchParams.keys()]) {
      if (sensitiveQueryName.test(name)) url.searchParams.set(name, '[REDACTED]');
    }
    return url.toString().slice(0, 4096);
  } catch {
    return redactDiagnosticText(value).slice(0, 4096);
  }
};

export const redactCurlInput = (value: string): string =>
  redactDiagnosticText(value).replace(/https?:\/\/[^\s'"\\]+/gi, (url) => redactDiagnosticUrl(url));

const tokenizeCurl = (input: string): string[] => {
  const tokens: string[] = [];
  let token = '';
  let quote: "'" | '"' | undefined;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] ?? '';
    if (escaping) {
      if (character !== '\n') token += character;
      escaping = false;
      continue;
    }
    if (character === '\\' && quote !== "'") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      else token += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (token) tokens.push(token);
      token = '';
      continue;
    }
    token += character;
  }

  if (escaping || quote) throw new Error('cURL 命令包含未闭合的引号或转义');
  if (token) tokens.push(token);
  return tokens;
};

export const parseCurlCommand = (input: string): CurlRequest => {
  const tokens = tokenizeCurl(input.trim());
  if (tokens.shift()?.toLocaleLowerCase() !== 'curl') throw new Error('命令必须以 curl 开头');

  const headers: Record<string, string> = {};
  let method = '';
  let url = '';
  let body: string | undefined;
  let timeoutMs = 15_000;
  let followRedirects = false;

  const takeValue = (flag: string): string => {
    const value = tokens.shift();
    if (!value) throw new Error(`${flag} 缺少参数`);
    return value;
  };

  while (tokens.length > 0) {
    const token = tokens.shift() ?? '';
    if (token === '-X' || token === '--request') {
      method = takeValue(token).toUpperCase();
    } else if (token === '-H' || token === '--header') {
      const header = takeValue(token);
      const separator = header.indexOf(':');
      if (separator <= 0) throw new Error(`无效请求头：${header}`);
      headers[header.slice(0, separator).trim()] = header.slice(separator + 1).trim();
    } else if (['-d', '--data', '--data-raw', '--data-binary'].includes(token)) {
      const value = takeValue(token);
      if (value.startsWith('@')) throw new Error('不支持从本地文件读取请求正文');
      body = value;
    } else if (token === '--url') {
      url = takeValue(token);
    } else if (token === '--max-time') {
      const seconds = Number(takeValue(token));
      if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('--max-time 必须是正数');
      timeoutMs = Math.min(30_000, Math.round(seconds * 1000));
    } else if (token === '-L' || token === '--location') {
      followRedirects = true;
    } else if (token === '-I' || token === '--head') {
      method = 'HEAD';
    } else if (token === '--compressed' || token === '-s' || token === '--silent') {
      continue;
    } else if (token.startsWith('-')) {
      throw new Error(`暂不支持 cURL 参数：${token}`);
    } else if (!url) {
      url = token;
    } else {
      throw new Error(`无法识别多余参数：${token}`);
    }
  }

  if (!url) throw new Error('cURL 命令缺少 URL');
  const parsedUrl = new URL(url);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('仅支持 HTTP 和 HTTPS');
  if (parsedUrl.username || parsedUrl.password) throw new Error('URL 中不能包含用户名或密码');
  if (!method) method = body === undefined ? 'GET' : 'POST';
  if (!/^[A-Z]+$/.test(method)) throw new Error('无效 HTTP 方法');

  return {
    url: parsedUrl.toString(),
    method,
    headers,
    ...(body === undefined ? {} : { body }),
    timeoutMs,
    followRedirects,
  };
};

const remoteObjectText = (object: RemoteObject): string => {
  if (typeof object.value === 'string') return object.value;
  if (object.value !== undefined) {
    try {
      return JSON.stringify(object.value);
    } catch {
      return String(object.value);
    }
  }
  if (object.unserializableValue) return object.unserializableValue;
  const properties = object.preview?.properties
    ?.map(({ name, value }) => `${name ?? '?'}: ${value ?? ''}`)
    .join(', ');
  return properties ? `{ ${properties} }` : (object.description ?? object.type ?? 'undefined');
};

const stackText = (stack: unknown): string | undefined => {
  const frames = (stack as { callFrames?: Array<Record<string, unknown>> } | undefined)?.callFrames;
  if (!frames?.length) return undefined;
  return frames
    .map(
      (frame) =>
        `${String(frame.functionName || '<anonymous>')} (${String(frame.url || '')}:${Number(frame.lineNumber ?? 0) + 1}:${Number(frame.columnNumber ?? 0) + 1})`,
    )
    .map((line) => sanitizeDiagnosticValue(line))
    .join('\n')
    .slice(0, 20_000);
};

const responseBody = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') ?? '';
  if (!textResponse(contentType)) {
    await response.body?.cancel();
    return '[binary response body omitted]';
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let output = '';
  while (bytes < maximumOutputBytes) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    output += decoder.decode(chunk.value, { stream: true });
    if (bytes >= maximumOutputBytes) {
      await reader.cancel();
      output += '\n[response truncated]';
      break;
    }
  }
  output += decoder.decode();
  return output.slice(0, maximumOutputBytes);
};

export class DiagnosticConsole {
  private readonly entries: DiagnosticEvidence[] = [];
  private consoleGeneration = 0;
  private readonly requests = new Map<string, NetworkRequest>();

  constructor(
    private readonly webContents: WebContents,
    private readonly pageRevision: () => string,
    private readonly onEntry: (entry: DiagnosticEvidence) => void,
  ) {
    webContents.debugger.on('message', (_event, method, parameters) => {
      this.handleMessage(method, parameters as Record<string, unknown>);
    });
  }

  async start(): Promise<void> {
    if (!this.webContents.debugger.isAttached()) this.webContents.debugger.attach('1.3');
    await this.webContents.debugger.sendCommand('Runtime.enable');
    await this.webContents.debugger.sendCommand('Log.enable');
    await this.webContents.debugger.sendCommand('Network.enable', {
      maxTotalBufferSize: 5_000_000,
      maxResourceBufferSize: 1_000_000,
    });
  }

  list(): DiagnosticEvidence[] {
    return [...this.entries];
  }

  clear(scope: 'all' | 'console' | 'network' = 'all'): void {
    if (scope !== 'network') this.consoleGeneration += 1;
    if (scope === 'all') {
      this.entries.length = 0;
      this.requests.clear();
      return;
    }
    const retained = this.entries.filter((entry) =>
      scope === 'network' ? entry.kind !== 'network' : entry.kind === 'network',
    );
    this.entries.splice(0, this.entries.length, ...retained);
    if (scope === 'network') this.requests.clear();
  }

  async evaluate(expression: string): Promise<DiagnosticEvidence> {
    if (!expression.trim()) throw new Error('请输入 JavaScript');
    const evaluated = (await this.webContents.debugger.sendCommand('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      generatePreview: true,
      userGesture: true,
    })) as {
      result?: RemoteObject;
      exceptionDetails?: {
        text?: string;
        exception?: RemoteObject;
        stackTrace?: unknown;
      };
    };
    const failure = evaluated.exceptionDetails;
    const output = failure
      ? remoteObjectText(failure.exception ?? { description: failure.text ?? 'JavaScript failed' })
      : remoteObjectText(evaluated.result ?? { value: undefined });
    return this.add({
      kind: 'command',
      level: failure ? 'error' : 'info',
      title: failure ? 'JavaScript 执行失败' : 'JavaScript 执行结果',
      message: redactDiagnosticText(output),
      ...(failure?.stackTrace ? { stack: stackText(failure.stackTrace) } : {}),
      command: {
        mode: 'javascript',
        input: redactDiagnosticText(expression),
        output: redactDiagnosticText(output).slice(0, maximumOutputBytes),
      },
      captureNotes: output.length > 20_000 ? ['命令输出超长，已截断'] : [],
      redactions: ['credentials in diagnostic content'],
    });
  }

  async runCurl(input: string): Promise<DiagnosticEvidence> {
    const request = parseCurlCommand(input);
    const startedAt = performance.now();
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
        ...(request.body === undefined ? {} : { body: request.body }),
        redirect: request.followRedirects ? 'follow' : 'manual',
        signal: AbortSignal.timeout(request.timeoutMs),
      });
      const headers = [...response.headers.entries()]
        .map(([name, value]) => `${name}: ${sensitiveName.test(name) ? '[REDACTED]' : value}`)
        .join('\n');
      const body = await responseBody(response);
      const output = redactDiagnosticText(
        `HTTP ${response.status} ${response.statusText}\n${headers}\n\n${body}`,
      ).slice(0, maximumOutputBytes);
      return this.add({
        kind: 'command',
        level: response.status >= 400 ? 'error' : 'info',
        title: `${request.method} ${redactDiagnosticUrl(request.url)}`.slice(0, 500),
        message: output,
        request: {
          method: request.method,
          headers: diagnosticHeaders(request.headers),
          ...diagnosticBody(request.body ?? ''),
          url: redactDiagnosticUrl(request.url),
          status: response.status,
          statusText: response.statusText,
          durationMs: Math.round(performance.now() - startedAt),
        },
        response: {
          headers: diagnosticHeaders(Object.fromEntries(response.headers.entries())),
          mimeType: (response.headers.get('content-type') ?? '').slice(0, 200),
          ...(textResponse(response.headers.get('content-type') ?? '')
            ? diagnosticBody(body)
            : { bodyState: 'omitted' as const }),
        },
        command: {
          mode: 'curl',
          input: redactCurlInput(input),
          output,
        },
        captureNotes: textResponse(response.headers.get('content-type') ?? '')
          ? []
          : ['二进制响应未作为文本采集'],
        redactions: ['authorization', 'cookie', 'set-cookie', 'sensitive query parameters'],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      return this.add({
        kind: 'command',
        level: 'error',
        title: `${request.method} ${redactDiagnosticUrl(request.url)}`.slice(0, 500),
        message: redactDiagnosticText(message),
        request: {
          method: request.method,
          headers: diagnosticHeaders(request.headers),
          ...diagnosticBody(request.body ?? ''),
          url: redactDiagnosticUrl(request.url),
          durationMs: Math.round(performance.now() - startedAt),
        },
        response: { bodyState: 'unavailable' },
        captureNotes: ['请求失败，未取得响应内容'],
        command: {
          mode: 'curl',
          input: redactCurlInput(input),
          output: redactDiagnosticText(message),
        },
        redactions: ['authorization', 'cookie', 'sensitive query parameters'],
      });
    }
  }

  private handleMessage(method: string, parameters: Record<string, unknown>): void {
    if (method === 'Runtime.consoleAPICalled') {
      void this.captureConsole(parameters);
      return;
    }

    if (method === 'Runtime.exceptionThrown') {
      const details = parameters.exceptionDetails as
        { text?: string; exception?: RemoteObject; stackTrace?: unknown; url?: string } | undefined;
      this.add({
        kind: 'exception',
        level: 'error',
        title: 'Uncaught exception',
        message: redactDiagnosticText(
          remoteObjectText(
            details?.exception ?? { description: details?.text ?? 'Unknown exception' },
          ),
        ),
        ...(details?.url ? { source: redactDiagnosticUrl(details.url) } : {}),
        ...(stackText(details?.stackTrace) ? { stack: stackText(details?.stackTrace) } : {}),
        redactions: [],
      });
      return;
    }

    if (method === 'Log.entryAdded') {
      const entry = parameters.entry as
        | { level?: string; text?: string; url?: string; source?: string; stackTrace?: unknown }
        | undefined;
      if (!entry) return;
      this.add({
        kind: 'system',
        level: entry.level === 'error' ? 'error' : entry.level === 'warning' ? 'warning' : 'info',
        title: entry.source ? `Browser ${entry.source}` : 'Browser log',
        message: redactDiagnosticText(entry.text ?? ''),
        ...(entry.url ? { source: redactDiagnosticUrl(entry.url) } : {}),
        ...(stackText(entry.stackTrace) ? { stack: stackText(entry.stackTrace) } : {}),
        redactions: [],
      });
      return;
    }

    if (method === 'Network.requestWillBeSent') {
      const requestId = String(parameters.requestId ?? '');
      const request = parameters.request as
        | {
            method?: string;
            url?: string;
            headers?: unknown;
            postData?: string;
            hasPostData?: boolean;
          }
        | undefined;
      if (!requestId || !request?.url) return;
      const previous = this.requests.get(requestId);
      if (previous && parameters.redirectResponse) {
        const redirect = parameters.redirectResponse as {
          status?: number;
          statusText?: string;
          headers?: unknown;
          mimeType?: string;
        };
        previous.response = {
          status: redirect.status ?? 0,
          statusText: redirect.statusText ?? '',
          headers: diagnosticHeaders(redirect.headers),
          mimeType: redirect.mimeType ?? '',
        };
        this.publishNetwork(
          requestId,
          previous,
          Number(parameters.timestamp ?? 0),
          { bodyState: 'unavailable' },
          '重定向响应未保留响应体',
        );
      }
      const tracked: NetworkRequest = {
        method: request.method ?? 'GET',
        url: request.url,
        startedAt: Number(parameters.timestamp ?? 0),
        pageUrl: redactDiagnosticUrl(this.webContents.getURL()),
        pageRevision: this.pageRevision(),
        headers: diagnosticHeaders(request.headers),
        ...(request.postData !== undefined
          ? diagnosticBody(request.postData)
          : { bodyState: request.hasPostData ? 'unavailable' : 'empty' }),
        ...(parameters.type ? { resourceType: String(parameters.type) } : {}),
      };
      this.requests.set(requestId, tracked);
      if (request.hasPostData && request.postData === undefined) {
        tracked.bodyPromise = this.commandWithTimeout('Network.getRequestPostData', { requestId })
          .then((result) => {
            if (typeof result.postData === 'string')
              Object.assign(tracked, diagnosticBody(result.postData));
          })
          .catch(() => undefined);
      }
      if (this.requests.size > 2_000) this.requests.delete(this.requests.keys().next().value ?? '');
      return;
    }
    if (
      method === 'Network.requestWillBeSentExtraInfo' ||
      method === 'Network.responseReceivedExtraInfo'
    ) {
      const tracked = this.requests.get(String(parameters.requestId ?? ''));
      if (!tracked) return;
      if (method === 'Network.requestWillBeSentExtraInfo')
        tracked.headers = diagnosticHeaders(parameters.headers);
      else {
        tracked.responseHeaders = diagnosticHeaders(parameters.headers);
        if (tracked.response) tracked.response.headers = tracked.responseHeaders;
      }
      return;
    }
    if (method === 'Network.responseReceived') {
      const tracked = this.requests.get(String(parameters.requestId ?? ''));
      const response = parameters.response as
        { status?: number; statusText?: string; headers?: unknown; mimeType?: string } | undefined;
      if (!tracked || !response) return;
      tracked.response = {
        status: Math.round(response.status ?? 0),
        statusText: response.statusText ?? '',
        headers: tracked.responseHeaders ?? diagnosticHeaders(response.headers),
        mimeType: response.mimeType ?? '',
      };
      if (/event-stream/i.test(tracked.response.mimeType) || tracked.resourceType === 'WebSocket') {
        this.publishNetwork(
          String(parameters.requestId),
          tracked,
          Number(parameters.timestamp ?? 0),
          { bodyState: 'omitted' },
          '持续流式响应仅采集连接信息，不记录完整数据流',
        );
        this.requests.delete(String(parameters.requestId));
      }
      return;
    }
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      const requestId = String(parameters.requestId ?? '');
      const tracked = this.requests.get(requestId);
      if (!tracked) return;
      void this.finishNetwork(
        requestId,
        tracked,
        Number(parameters.timestamp ?? 0),
        method === 'Network.loadingFailed'
          ? String(parameters.errorText ?? 'Network request failed')
          : undefined,
      );
    }
  }

  private commandWithTimeout(
    method: string,
    params: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('诊断内容读取超时')), 3000);
      this.webContents.debugger.sendCommand(method, params).then(
        (result: Record<string, unknown>) => {
          clearTimeout(timer);
          resolve(result);
        },
        (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private async finishNetwork(
    requestId: string,
    tracked: NetworkRequest,
    timestamp: number,
    failure?: string,
  ): Promise<void> {
    let body: NonNullable<DiagnosticEvidence['response']> = { bodyState: 'unavailable' };
    let note = failure ? `请求失败：${failure}` : '';
    try {
      if (
        !failure &&
        (tracked.method === 'HEAD' || [204, 304].includes(tracked.response?.status ?? 0))
      ) {
        body = { body: '', bodyState: 'empty' };
      } else if (!failure && textResponse(tracked.response?.mimeType ?? '')) {
        const result = await this.commandWithTimeout('Network.getResponseBody', { requestId });
        if (typeof result.body !== 'string') throw new Error('浏览器未返回响应体');
        const value = result.base64Encoded
          ? Buffer.from(result.body, 'base64').toString('utf8')
          : result.body;
        body = diagnosticBody(value);
      } else if (!failure) {
        body = { bodyState: 'omitted' };
        note = '二进制响应未作为文本采集';
      }
    } catch (error) {
      note = error instanceof Error ? error.message : '无法读取响应体';
    }
    await tracked.bodyPromise;
    if (this.requests.get(requestId) !== tracked) return;
    this.requests.delete(requestId);
    this.publishNetwork(requestId, tracked, timestamp, body, note, Boolean(failure));
  }

  private publishNetwork(
    requestId: string,
    tracked: NetworkRequest,
    timestamp: number,
    body: NonNullable<DiagnosticEvidence['response']>,
    note: string,
    failed = false,
  ): void {
    const status = tracked.response?.status;
    this.add({
      kind: 'network',
      level: failed || (status ?? 0) >= 500 ? 'error' : (status ?? 0) >= 400 ? 'warning' : 'info',
      title: `${tracked.method} ${redactDiagnosticUrl(tracked.url)}`.slice(0, 500),
      message: failed
        ? sanitizeDiagnosticValue(note).slice(0, 20_000)
        : `${status ?? ''} ${tracked.response?.statusText ?? ''}`.trim(),
      pageUrl: tracked.pageUrl,
      pageRevision: tracked.pageRevision,
      request: {
        requestId,
        method: tracked.method,
        url: redactDiagnosticUrl(tracked.url),
        headers: tracked.headers,
        bodyState: tracked.bodyState,
        ...(tracked.body === undefined ? {} : { body: tracked.body }),
        ...(status === undefined ? {} : { status, statusText: tracked.response?.statusText ?? '' }),
        ...(tracked.resourceType ? { resourceType: tracked.resourceType } : {}),
        durationMs: Math.max(0, Math.round((timestamp - tracked.startedAt) * 1000)),
      },
      response: {
        ...body,
        headers: tracked.response?.headers ?? {},
        mimeType: (tracked.response?.mimeType ?? '').slice(0, 200),
      },
      captureNotes: [note, tracked.bodyState === 'unavailable' ? '请求体未能读取' : '']
        .filter(Boolean)
        .map((value) => sanitizeDiagnosticValue(value).slice(0, 500)),
      redactions: ['credentials in headers, URL and bodies'],
    });
  }

  private async captureConsole(parameters: Record<string, unknown>): Promise<void> {
    const generation = this.consoleGeneration;
    const type = String(parameters.type ?? 'log');
    const pageUrl = redactDiagnosticUrl(this.webContents.getURL());
    const pageRevision = this.pageRevision();
    const notes: string[] = [];
    const args = (parameters.args as RemoteObject[] | undefined) ?? [];
    let budget = 20;
    const snapshot = async (
      arg: RemoteObject,
      depth: number,
      seen: Set<string>,
    ): Promise<unknown> => {
      if (!arg.objectId) return arg.value ?? remoteObjectText(arg);
      if (depth >= 3 || budget <= 0 || seen.has(arg.objectId)) {
        notes.push('对象快照达到深度/数量限制或包含循环引用，部分属性仅保留摘要');
        return remoteObjectText(arg);
      }
      budget -= 1;
      const nextSeen = new Set(seen).add(arg.objectId);
      try {
        const result = await this.commandWithTimeout('Runtime.getProperties', {
          objectId: arg.objectId,
          ownProperties: true,
          generatePreview: true,
        });
        const properties = result.result as
          Array<{ name: string; value?: RemoteObject }> | undefined;
        if (!properties) throw new Error('对象属性不可用');
        if (properties.length > 100) notes.push('对象属性超过 100 项，已截断');
        return Object.fromEntries(
          await Promise.all(
            properties.slice(0, 100).map(async (property) => {
              if (!property.value) {
                notes.push('未执行 getter');
                return [property.name, '[getter omitted]'];
              }
              return [property.name, await snapshot(property.value, depth + 1, nextSeen)];
            }),
          ),
        );
      } catch {
        notes.push('对象内容无法读取，仅保留浏览器摘要');
        return remoteObjectText(arg);
      }
    };
    const values = await Promise.all(
      args.slice(0, 50).map(async (arg) => {
        const value = await snapshot(arg, 0, new Set());
        const body = diagnosticBody(typeof value === 'string' ? value : JSON.stringify(value));
        if (body.bodyState === 'truncated') notes.push('参数内容超长，已截断');
        return body.body;
      }),
    );
    if (generation !== this.consoleGeneration) return;
    if (args.length > 50) notes.push('参数超过 50 项，已截断');
    this.add({
      kind: 'console',
      level:
        type === 'error' || type === 'assert' ? 'error' : type === 'warning' ? 'warning' : 'info',
      title: `console.${type}`,
      message: diagnosticBody(values.join(' ')).body,
      arguments: values,
      captureNotes: [...new Set(notes)],
      pageUrl,
      pageRevision,
      ...(stackText(parameters.stackTrace) ? { stack: stackText(parameters.stackTrace) } : {}),
      redactions: ['credentials in diagnostic content'],
    });
  }

  private add(
    entry: Omit<DiagnosticEvidence, 'id' | 'timestamp' | 'pageUrl'> & { pageUrl?: string },
  ): DiagnosticEvidence {
    const complete: DiagnosticEvidence = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      pageUrl: redactDiagnosticUrl(this.webContents.getURL()),
      pageRevision: this.pageRevision(),
      ...entry,
    };
    this.entries.push(complete);
    if (this.entries.length > maximumEntries)
      this.entries.splice(0, this.entries.length - maximumEntries);
    this.onEntry(complete);
    return complete;
  }
}
