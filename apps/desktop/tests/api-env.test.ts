import { expect, it } from 'vitest';
import { serviceConfig, serviceUrls } from '@markfix/contracts';
import { accountPageUrl } from '../src/account-pages.js';
import { desktopUpdateFeedUrl } from '../src/desktop-update.js';

it('uses the shared deployed origin for API, account pages and updates', () => {
  const defaults = serviceUrls('production');
  expect(defaults.origin).toBe(serviceConfig.productionOrigin);
  expect(defaults.apiOrigin).toBe(defaults.origin);
  const services = serviceUrls('production', 'https://new-markfix.example');
  expect(accountPageUrl('register', services.origin)).toBe(`${services.apiOrigin}/register`);
  expect(desktopUpdateFeedUrl(services.apiOrigin, '0.1.0', 'arm64')).toBe(
    `${services.origin}/v1/desktop-updates?version=0.1.0&platform=darwin&arch=arm64`,
  );
});
