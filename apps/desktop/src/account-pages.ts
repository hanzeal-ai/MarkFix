import { z } from 'zod';

export const accountPageSchema = z.enum(['register', 'forgot-password', 'privacy', 'terms']);
export type AccountPage = z.infer<typeof accountPageSchema>;
export const accountPageChannel = 'account:open-page';

export function accountPageUrl(page: unknown, origin: string): string {
  const path = accountPageSchema.parse(page);
  const url = new URL(origin);
  if (
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('账户服务地址配置无效，请联系管理员。');
  return new URL(`/${path}`, url).href;
}
