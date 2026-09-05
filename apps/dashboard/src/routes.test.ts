import { describe, expect, it } from 'vitest';
import { topLevelRoute } from './routes.js';

describe('topLevelRoute', () => {
  it.each([
    ['/login', 'account-access'],
    ['/register', 'account-access'],
    ['/accept-invitation', 'account-access'],
    ['/account', 'account-settings'],
    ['/privacy', 'legal'],
    ['/terms', 'legal'],
    ['/app/projects', 'application'],
    ['/', 'application'],
  ] as const)('maps %s to %s', (pathname, expected) => {
    expect(topLevelRoute(pathname)).toBe(expected);
  });
});
