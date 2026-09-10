import { afterEach, expect, it, vi } from 'vitest';
import { cliSetupCommand, dashboardServiceUrls } from './service-config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it.each(['http://192.0.2.10:8766', 'https://new-markfix.example'])(
  'follows the deployed website for API calls and CLI instructions: %s',
  (origin) => {
    vi.stubEnv('MODE', 'production');
    vi.stubEnv('PROD', true);
    vi.stubEnv('MARKFIX_SERVICE_ORIGIN', '');
    vi.stubGlobal('window', { location: { origin } });
    expect(dashboardServiceUrls()).toEqual({ origin, apiOrigin: origin });
    expect(cliSetupCommand()).toBe(`markfix setup --server ${origin}`);
  },
);

it('uses the same explicit override for the API and setup command', () => {
  vi.stubEnv('MARKFIX_SERVICE_ORIGIN', 'https://override.example');
  expect(dashboardServiceUrls().apiOrigin).toBe('https://override.example');
  expect(cliSetupCommand()).toBe('markfix setup --server https://override.example');
});

it('adds local HTTP opt-in only for loopback development', () => {
  vi.stubEnv('MODE', 'development');
  vi.stubEnv('PROD', false);
  vi.stubEnv('MARKFIX_SERVICE_ORIGIN', '');
  expect(cliSetupCommand()).toBe('markfix setup --server http://localhost:4310 --allow-local-http');
});
