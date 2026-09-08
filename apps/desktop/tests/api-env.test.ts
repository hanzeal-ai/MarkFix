import { fileURLToPath } from 'node:url';
import { loadEnv } from 'electron-vite';
import { expect, it } from 'vitest';

it('loads separate desktop API defaults for development and production', () => {
  const desktopDir = fileURLToPath(new URL('..', import.meta.url));
  expect(loadEnv('development', desktopDir, 'MAIN_VITE_').MAIN_VITE_API_URL).toBe(
    'http://localhost:4310',
  );
  expect(loadEnv('production', desktopDir, 'MAIN_VITE_').MAIN_VITE_API_URL).toBe(
    'http://121.40.211.86:8766',
  );
});
