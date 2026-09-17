import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  Button,
  DiagnosticDetails,
  Input,
  NativeSelect,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@markfix/ui';
import {
  AlertTriangle,
  Code2,
  Network,
  Paperclip,
  Play,
  Terminal,
  Trash2,
  X,
} from '@markfix/ui/icons';
import { diagnosticEvidenceSections, type DiagnosticEvidence } from '@markfix/contracts';

type DiagnosticsPanelProps = {
  entries: DiagnosticEvidence[];
  selectedEvidenceIds: Set<string>;
  withSidebar: boolean;
  onClear: (scope: 'console' | 'network') => Promise<void>;
  onClose: () => void;
  onQuote: (entry: DiagnosticEvidence) => void;
};

type ConsoleFilter = 'all' | 'error' | 'warning' | 'info' | 'command';
type DiagnosticTab = 'console' | 'network';
type NetworkFilter =
  | 'all'
  | 'error'
  | 'fetch'
  | 'document'
  | 'stylesheet'
  | 'script'
  | 'image'
  | 'media'
  | 'font'
  | 'websocket'
  | 'other';

const networkCategory = (entry: DiagnosticEvidence): NetworkFilter => {
  const resourceType = entry.request?.resourceType?.toLocaleLowerCase();
  if (resourceType === 'xhr' || resourceType === 'fetch') return 'fetch';
  if (resourceType === 'document') return 'document';
  if (resourceType === 'stylesheet') return 'stylesheet';
  if (resourceType === 'script') return 'script';
  if (resourceType === 'image') return 'image';
  if (resourceType === 'media') return 'media';
  if (resourceType === 'font') return 'font';
  if (resourceType === 'websocket') return 'websocket';
  return 'other';
};

const matchesText = (entry: DiagnosticEvidence, input: string): boolean => {
  const query = input.trim().toLocaleLowerCase();
  if (!query) return true;
  return [
    entry.title,
    entry.message,
    entry.source,
    entry.pageUrl,
    entry.request?.url,
    entry.request?.method,
    entry.request?.statusText,
    entry.command?.input,
    entry.command?.output,
    entry.request?.body,
    entry.response?.body,
  ]
    .filter(Boolean)
    .some((value) => value?.toLocaleLowerCase().includes(query));
};

const entryTime = (timestamp: string): string =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const entryContext = (entry: DiagnosticEvidence): string => {
  if (entry.request) {
    return [
      entry.request.url,
      entry.request.resourceType,
      entry.request.durationMs === undefined ? undefined : `${entry.request.durationMs} ms`,
    ]
      .filter(Boolean)
      .join(' · ');
  }
  return entry.source ?? entry.pageUrl;
};

export function DiagnosticsPanel({
  entries,
  selectedEvidenceIds,
  withSidebar,
  onClear,
  onClose,
  onQuote,
}: DiagnosticsPanelProps): React.JSX.Element {
  const [tab, setTab] = useState<DiagnosticTab>('console');
  const [filterText, setFilterText] = useState('');
  const [consoleFilter, setConsoleFilter] = useState<ConsoleFilter>('all');
  const [networkFilter, setNetworkFilter] = useState<NetworkFilter>('all');
  const [commandMode, setCommandMode] = useState<'javascript' | 'curl'>('javascript');
  const [command, setCommand] = useState('document.title');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const visibleEntries = useMemo(
    () =>
      entries
        .filter((entry) =>
          tab === 'network' ? entry.kind === 'network' : entry.kind !== 'network',
        )
        .filter((entry) => {
          if (tab === 'network') {
            if (networkFilter === 'error') return entry.level !== 'info';
            return networkFilter === 'all' || networkCategory(entry) === networkFilter;
          }
          if (consoleFilter === 'command') return entry.kind === 'command';
          return consoleFilter === 'all' || entry.level === consoleFilter;
        })
        .filter((entry) => matchesText(entry, filterText))
        .toReversed(),
    [consoleFilter, entries, filterText, networkFilter, tab],
  );
  const networkErrors = entries.filter(
    (entry) => entry.kind === 'network' && entry.level !== 'info',
  ).length;
  const consoleErrors = entries.filter(
    (entry) => entry.kind !== 'network' && entry.level === 'error',
  ).length;

  const run = async (): Promise<void> => {
    if (!command.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      if (commandMode === 'javascript') await window.markfix.evaluateJavaScript(command);
      else await window.markfix.runCurl(command);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '命令执行失败');
    } finally {
      setBusy(false);
    }
  };

  const handleCommandKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    void run();
  };

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as DiagnosticTab)} asChild>
      <aside
        className={`diagnostics-panel gap-0 ${withSidebar ? 'with-sidebar' : ''}`}
        aria-label="网站开发者控制台"
      >
        <header className="diagnostics-header">
          <TabsList
            className="h-full w-auto justify-start rounded-none bg-transparent p-0 text-inherit"
            asChild
          >
            <nav aria-label="诊断类型">
              <TabsTrigger
                value="console"
                className="h-full flex-none justify-start rounded-none border-0 px-3 py-0 text-xs shadow-none"
              >
                <Terminal /> Console {consoleErrors > 0 && <i>{consoleErrors}</i>}
              </TabsTrigger>
              <TabsTrigger
                value="network"
                className="h-full flex-none justify-start rounded-none border-0 px-3 py-0 text-xs shadow-none"
              >
                <Network /> Network {networkErrors > 0 && <i>{networkErrors}</i>}
              </TabsTrigger>
            </nav>
          </TabsList>
          <div>
            <Button
              variant="ghost"
              size="icon"
              title="关闭控制台"
              aria-label="关闭控制台"
              onClick={onClose}
            >
              <X />
            </Button>
          </div>
        </header>

        <TabsContent value={tab} forceMount className="diagnostics-content">
          <div className="diagnostics-filterbar">
            <Button
              title={`清空 ${tab === 'network' ? 'Network' : 'Console'}`}
              aria-label={`清空 ${tab === 'network' ? 'Network' : 'Console'}`}
              onClick={() => void onClear(tab)}
            >
              <Trash2 />
            </Button>
            <Input
              value={filterText}
              aria-label={`${tab === 'network' ? 'Network' : 'Console'} 文本筛选`}
              placeholder="筛选"
              onChange={(event) => setFilterText(event.target.value)}
            />
            {tab === 'console' ? (
              <NativeSelect
                aria-label="Console 类型筛选"
                value={consoleFilter}
                onChange={(event) => setConsoleFilter(event.target.value as ConsoleFilter)}
              >
                <option value="all">全部类型</option>
                <option value="error">错误</option>
                <option value="warning">警告</option>
                <option value="info">信息</option>
                <option value="command">命令</option>
              </NativeSelect>
            ) : (
              <NativeSelect
                aria-label="Network 类型筛选"
                value={networkFilter}
                onChange={(event) => setNetworkFilter(event.target.value as NetworkFilter)}
              >
                <option value="all">全部类型</option>
                <option value="error">错误请求</option>
                <option value="fetch">Fetch/XHR</option>
                <option value="document">Doc</option>
                <option value="stylesheet">CSS</option>
                <option value="script">JS</option>
                <option value="image">Img</option>
                <option value="media">Media</option>
                <option value="font">Font</option>
                <option value="websocket">WS</option>
                <option value="other">Other</option>
              </NativeSelect>
            )}
          </div>

          <div className="diagnostics-list">
            {visibleEntries.length === 0 ? (
              <div className="diagnostics-empty">
                {tab === 'network' ? <Network /> : <Code2 />}
                <span>
                  {filterText ||
                  (tab === 'console' ? consoleFilter !== 'all' : networkFilter !== 'all')
                    ? '没有匹配的记录'
                    : tab === 'network'
                      ? '暂无网络请求'
                      : '暂无控制台输出'}
                </span>
              </div>
            ) : (
              visibleEntries.map((entry) => (
                <article className={`diagnostic-entry ${entry.level}`} key={entry.id}>
                  <span className="diagnostic-level">
                    {entry.level === 'error' || entry.level === 'warning' ? (
                      <AlertTriangle />
                    ) : (
                      <Code2 />
                    )}
                  </span>
                  <div className="diagnostic-content">
                    <div className="diagnostic-title">
                      <strong>{entry.title}</strong>
                      <time>{entryTime(entry.timestamp)}</time>
                    </div>
                    <pre>{entry.message || '(empty)'}</pre>
                    {entry.command && <code>$ {entry.command.input}</code>}
                    {entry.stack && (
                      <details>
                        <summary>调用堆栈</summary>
                        <pre>{entry.stack}</pre>
                      </details>
                    )}
                    <DiagnosticDetails
                      title="查看完整引用内容"
                      sections={diagnosticEvidenceSections(entry)}
                    />
                    <small title={entryContext(entry)}>{entryContext(entry)}</small>
                  </div>
                  <Button
                    className="diagnostic-quote"
                    disabled={selectedEvidenceIds.has(entry.id)}
                    title={selectedEvidenceIds.has(entry.id) ? '已引用' : '引用到当前标注'}
                    onClick={() => onQuote(entry)}
                  >
                    <Paperclip /> {selectedEvidenceIds.has(entry.id) ? '已引用' : '引用'}
                  </Button>
                </article>
              ))
            )}

            {tab === 'console' && (
              <div className="diagnostics-command">
                <NativeSelect
                  aria-label="命令类型"
                  value={commandMode}
                  onChange={(event) => {
                    const nextMode = event.target.value as 'javascript' | 'curl';
                    setCommandMode(nextMode);
                    setCommand(
                      nextMode === 'javascript' ? 'document.title' : "curl 'https://example.com'",
                    );
                    setError(undefined);
                  }}
                >
                  <option value="javascript">JavaScript</option>
                  <option value="curl">cURL</option>
                </NativeSelect>
                <Textarea
                  value={command}
                  rows={1}
                  placeholder="输入命令，⌘/Ctrl + Enter 执行"
                  aria-label="控制台命令"
                  spellCheck={false}
                  onChange={(event) => setCommand(event.target.value)}
                  onKeyDown={handleCommandKeyDown}
                />
                <Button
                  className="run"
                  disabled={busy || !command.trim()}
                  onClick={() => void run()}
                >
                  <Play /> {busy ? '运行中' : '运行'}
                </Button>
                {error && <span className="diagnostics-command-error">{error}</span>}
                <small>
                  ⌘/Ctrl + Enter 执行；cURL
                  可访问当前设备网络，请仅运行可信命令。不会读取本地文件或自动携带页面 Cookie。
                </small>
              </div>
            )}
          </div>
        </TabsContent>
      </aside>
    </Tabs>
  );
}
