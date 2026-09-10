import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

it.each([
  ['', '/v1/artifacts/image.png', 'http://121.40.211.86:8766/v1/artifacts/image.png'],
  ['', 'https://cdn.example.test/image.png', 'https://cdn.example.test/image.png'],
  [
    'http://localhost:4310',
    '/v1/artifacts/image.png',
    'http://localhost:4310/v1/artifacts/image.png',
  ],
  ['https://service.example.test', 'image.png', 'https://service.example.test/image.png'],
])('resolves screenshot URLs with API base %j and path %j', async (base, path, expected) => {
  vi.stubEnv('MARKFIX_SERVICE_ORIGIN', base);
  vi.stubEnv('MODE', 'production');
  vi.stubEnv('PROD', true);
  vi.stubGlobal('window', { location: { origin: 'http://121.40.211.86:8766' } });
  const { resolveAdminAssetUrl } = await import('./api');
  expect(resolveAdminAssetUrl(path)).toBe(expected);
});
