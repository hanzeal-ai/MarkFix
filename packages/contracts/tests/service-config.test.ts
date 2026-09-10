import { expect, it } from 'vitest';
import { serviceConfig, serviceUrls } from '../src/service-config.js';

it('keeps development ports separate and deployed services on one origin', () => {
  expect(serviceUrls('development')).toEqual({
    origin: serviceConfig.developmentOrigin,
    apiOrigin: serviceConfig.developmentApiOrigin,
  });
  expect(serviceUrls('production')).toEqual({
    origin: serviceConfig.productionOrigin,
    apiOrigin: serviceConfig.productionOrigin,
  });
});

it.each(['production', 'development', 'test'])('overrides all service URLs in %s', (mode) => {
  expect(serviceUrls(mode, 'https://new-service.example/')).toEqual({
    origin: 'https://new-service.example',
    apiOrigin: 'https://new-service.example',
  });
});

it.each([
  'javascript:alert(1)',
  'file:///tmp/config',
  'https://user:pass@service.example',
  'https://service.example/path',
  'https://service.example?next=evil',
  'https://service.example#evil',
  'https://one.example,https://two.example',
])('rejects an invalid service origin %s', (origin) => {
  expect(() => serviceUrls('production', origin)).toThrow();
});
