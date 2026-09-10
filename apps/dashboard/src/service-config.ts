import { serviceUrls } from '@markfix/contracts';

// A deployed dashboard calls the same origin that serves the website.
export const dashboardServiceUrls = () =>
  serviceUrls(
    import.meta.env.MODE,
    import.meta.env.MARKFIX_SERVICE_ORIGIN ||
      (import.meta.env.PROD ? window.location.origin : undefined),
  );

export function cliFirstUseCommand() {
  const { apiOrigin } = dashboardServiceUrls();
  const url = new URL(apiOrigin);
  const localHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return `markfix projects list --server ${apiOrigin}${localHttp ? ' --allow-local-http' : ''}`;
}
