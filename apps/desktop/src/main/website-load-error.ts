export const websiteLoadError = (error: unknown, url: string): Error => {
  let hostname = url || '该网站';
  try {
    hostname = new URL(url).hostname || hostname;
  } catch {
    // Keep the original value so error reporting never masks the navigation failure.
  }
  const code = (error as { code?: unknown }).code;
  if (code === 'ERR_NAME_NOT_RESOLVED')
    return new Error(`无法打开 ${hostname}：域名无法解析，请检查项目地址或删除该项目。`);
  if (code === 'ERR_CONNECTION_REFUSED')
    return new Error(`无法打开 ${hostname}：目标服务拒绝连接，请确认服务已启动。`);
  return new Error(`无法打开 ${hostname}，请检查网络连接后重试。`);
};

export const websiteLoadFailure = (
  url: string,
  description: string,
  code?: number,
): Record<string, unknown> => ({
  url,
  description,
  ...(code === undefined ? {} : { code }),
  message: websiteLoadError({ code: description }, url).message,
});
