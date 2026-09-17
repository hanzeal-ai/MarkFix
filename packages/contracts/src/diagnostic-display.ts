import type { DiagnosticEvidence } from './index.js';

export const diagnosticEvidenceSections = (
  entry: DiagnosticEvidence,
): Array<{ label: string; value: string }> => {
  const sections = [
    { label: '页面', value: entry.pageUrl },
    { label: '记录时间', value: entry.timestamp },
    { label: '内容', value: entry.message || '(空)' },
  ];
  const body = (value: string | undefined, state: string | undefined) => {
    const status: Record<string, string> = {
      empty: '内容为空',
      truncated: '内容超长，已截断',
      unavailable: '未能获取内容',
      omitted: '内容未采集（见采集说明）',
    };
    return state === 'captured'
      ? (value ?? '(空)')
      : `${state ? (status[state] ?? state) : '未采集（旧记录）'}${value ? `\n${value}` : ''}`;
  };
  if (entry.request) {
    sections.push({
      label: '接口 / 请求 URL',
      value: `${entry.request.method} ${entry.request.url}`,
    });
    sections.push({ label: '请求标识', value: entry.request.requestId ?? '未提供' });
    sections.push({
      label: '状态与耗时',
      value: `${entry.request.status ?? '无 HTTP 响应'} ${entry.request.statusText ?? ''}${entry.request.durationMs === undefined ? '' : ` · ${entry.request.durationMs} ms`}`,
    });
    sections.push({
      label: '请求头',
      value: entry.request.headers
        ? JSON.stringify(entry.request.headers, null, 2)
        : '未采集（旧记录）',
    });
    sections.push({ label: '请求内容', value: body(entry.request.body, entry.request.bodyState) });
    sections.push({ label: '响应类型', value: entry.response?.mimeType || '未提供' });
    sections.push({
      label: '响应头',
      value: entry.response?.headers
        ? JSON.stringify(entry.response.headers, null, 2)
        : '未采集（旧记录）',
    });
    sections.push({
      label: '响应内容',
      value: body(entry.response?.body, entry.response?.bodyState),
    });
  }
  entry.arguments?.forEach((value, index) => sections.push({ label: `参数 ${index + 1}`, value }));
  if (entry.command)
    sections.push(
      { label: '执行命令', value: entry.command.input },
      { label: '命令输出', value: entry.command.output },
    );
  if (entry.source) sections.push({ label: '来源', value: entry.source });
  if (entry.stack) sections.push({ label: '调用堆栈', value: entry.stack });
  if (entry.captureNotes?.length)
    sections.push({ label: '采集说明', value: entry.captureNotes.join('\n') });
  if (entry.redactions.length)
    sections.push({ label: '脱敏项目', value: entry.redactions.join(', ') });
  return sections;
};
