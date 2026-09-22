// The deployed website and API share this origin. Change it here when moving to a domain.
export const serviceConfig = {
  productionOrigin: 'https://markfix.hanzeal.com',
  developmentOrigin: 'http://localhost:4311',
  developmentApiOrigin: 'http://localhost:4310',
} as const;

export function serviceUrls(mode: string, override?: string) {
  const development = mode === 'development' || mode === 'test';
  const value =
    override || (development ? serviceConfig.developmentOrigin : serviceConfig.productionOrigin);
  const url = new URL(value);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'MARKFIX_SERVICE_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment',
    );
  }
  return {
    origin: url.origin,
    apiOrigin: development && !override ? serviceConfig.developmentApiOrigin : url.origin,
  };
}
