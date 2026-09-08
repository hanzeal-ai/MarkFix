export function projectErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/valid HTTPS website address|Invalid URL/i.test(message))
    return '请输入有效的 HTTPS 网站地址，例如 https://example.com。';
  if (/fetch failed|ECONNREFUSED|Failed to fetch/i.test(message))
    return '无法连接服务，请检查网络后重试。';
  const detail = message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
  return /[\u4e00-\u9fff]/.test(detail) ? detail : '创建项目失败，请检查网站地址或稍后重试。';
}
