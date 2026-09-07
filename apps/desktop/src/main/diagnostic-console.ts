import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type { DiagnosticEvidence } from '@markfix/contracts';

type RemoteObject = {
  type?: string;
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
  value
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
  if (object.description) return object.description;
  const properties = object.preview?.properties
    ?.map(({ name, value }) => `${name ?? '?'}: ${value ?? ''}`)
    .join(', ');
  return properties ? `{ ${properties} }` : (object.type ?? 'undefined');
};

const stackText = (stack: unknown): string | undefined => {
  const frames = (stack as { callFrames?: Array<Record<string, unknown>> } | undefined)?.callFrames;
  if (!frames?.length) return undefined;
  return frames
    .map(
      (frame) =>
        `${String(frame.functionName || '<anonymous>')} (${String(frame.url || '')}:${Number(frame.lineNumber ?? 0) + 1}:${Number(frame.columnNumber ?? 0) + 1})`,
    )
    .join('\n')
    .slice(0, 20_000);
};

const responseBody = async (response: Response): Promise<string> => {
  const contentType = response.headers.get('content-type') ?? '';
  if (!/(json|text|xml|javascript|x-www-form-urlencoded)/i.test(contentType)) {
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
      redactions: [],
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
        title: `${request.method} ${redactDiagnosticUrl(request.url)}`,
        message: output,
        request: {
          method: request.method,
          url: redactDiagnosticUrl(request.url),
          status: response.status,
          statusText: response.statusText,
          durationMs: Math.round(performance.now() - startedAt),
        },
        command: {
          mode: 'curl',
          input: redactCurlInput(input),
          output,
        },
        redactions: ['authorization', 'cookie', 'set-cookie', 'sensitive query parameters'],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Request failed';
      return this.add({
        kind: 'command',
        level: 'error',
        title: `${request.method} ${redactDiagnosticUrl(request.url)}`,
        message: redactDiagnosticText(message),
        request: {
          method: request.method,
          url: redactDiagnosticUrl(request.url),
          durationMs: Math.round(performance.now() - startedAt),
        },
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
      const type = String(parameters.type ?? 'log');
      const args = (parameters.args as RemoteObject[] | undefined) ?? [];
      this.add({
        kind: 'console',
        level:
          type === 'error' || type === 'assert' ? 'error' : type === 'warning' ? 'warning' : 'info',
        title: `console.${type}`,
        message: redactDiagnosticText(args.map(remoteObjectText).join(' ')),
        ...(stackText(parameters.stackTrace) ? { stack: stackText(parameters.stackTrace) } : {}),
        redactions: [],
      });
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
      const request = parameters.request as { method?: string; url?: string } | undefined;
      if (!requestId || !request?.url) return;
      this.requests.set(requestId, {
        method: request.method ?? 'GET',
        url: request.url,
        startedAt: Number(parameters.timestamp ?? 0),
        ...(parameters.type ? { resourceType: String(parameters.type) } : {}),
      });
      if (this.requests.size > 2_000) this.requests.delete(this.requests.keys().next().value ?? '');
      return;
    }

    if (method === 'Network.responseReceived') {
      const requestId = String(parameters.requestId ?? '');
      const tracked = this.requests.get(requestId);
      const response = parameters.response as
        { url?: string; status?: number; statusText?: string } | undefined;
      if (!response?.url) return;
      const status = Math.round(response.status ?? 0);
      const durationMs = tracked
        ? Math.max(
            0,
            Math.round(
              (Number(parameters.timestamp ?? tracked.startedAt) - tracked.startedAt) * 1000,
            ),
          )
        : undefined;
      this.add({
        kind: 'network',
        level: status >= 500 ? 'error' : status >= 400 ? 'warning' : 'info',
        title: `${tracked?.method ?? 'GET'} ${status}`,
        message: `${status} ${response.statusText ?? ''}`.trim(),
        request: {
          requestId,
          method: tracked?.method ?? 'GET',
          url: redactDiagnosticUrl(response.url),
          status,
          ...(response.statusText ? { statusText: response.statusText } : {}),
          ...(parameters.type || tracked?.resourceType
            ? { resourceType: String(parameters.type ?? tracked?.resourceType) }
            : {}),
          ...(durationMs === undefined ? {} : { durationMs }),
        },
        redactions: ['sensitive query parameters'],
      });
      return;
    }

    if (method === 'Network.loadingFailed') {
      const requestId = String(parameters.requestId ?? '');
      const tracked = this.requests.get(requestId);
      const errorText = String(parameters.errorText ?? 'Network request failed');
      const durationMs = tracked
        ? Math.max(
            0,
            Math.round(
              (Number(parameters.timestamp ?? tracked.startedAt) - tracked.startedAt) * 1000,
            ),
          )
        : undefined;
      this.add({
        kind: 'network',
        level: parameters.canceled ? 'warning' : 'error',
        title: `${tracked?.method ?? 'GET'} failed`,
        message: redactDiagnosticText(errorText),
        request: {
          requestId,
          method: tracked?.method ?? 'GET',
          url: redactDiagnosticUrl(tracked?.url ?? this.webContents.getURL()),
          ...(tracked?.resourceType ? { resourceType: tracked.resourceType } : {}),
          ...(durationMs === undefined ? {} : { durationMs }),
        },
        redactions: ['sensitive query parameters'],
      });
      this.requests.delete(requestId);
    }
  }

  private add(entry: Omit<DiagnosticEvidence, 'id' | 'timestamp' | 'pageUrl'>): DiagnosticEvidence {
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
