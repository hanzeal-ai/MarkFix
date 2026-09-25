import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppController } from '../src/app.controller.js';
import { AppService } from '../src/app.service.js';
import { AuthService } from '../src/auth.service.js';
import { AuthRateLimitService } from '../src/auth-rate-limit.service.js';
import { AuthGuard } from '../src/auth.guard.js';
import { SubscriptionService } from '../src/subscription.service.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClientPolicyService } from '../src/client-policy.service.js';

afterEach(() => vi.unstubAllEnvs());
function setup() {
  vi.stubEnv('MARKFIX_MINIMUM_DESKTOP_VERSION', '0.1.0');
  vi.stubEnv('MARKFIX_RECOMMENDED_DESKTOP_VERSION', '0.2.0');
  vi.stubEnv('MARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL', 'https://example.com/0.2.0-arm64.zip');
  vi.stubEnv('MARKFIX_DESKTOP_MAC_X64_UPDATE_URL', 'https://example.com/0.2.0-x64.zip');
  return new ClientPolicyService();
}
describe('native macOS update feed', () => {
  it.each(['arm64', 'x64'])('selects the %s archive from the same version policy', (arch) => {
    expect(setup().getUpdate('0.1.0', 'darwin', arch)).toEqual({
      url: `https://example.com/0.2.0-${arch}.zip`,
      name: '0.2.0',
    });
  });
  it('never serves a native archive for a trial distribution', () => {
    const service = setup();
    vi.stubEnv('MARKFIX_DESKTOP_MAC_DISTRIBUTION', 'trial');
    expect(() => service.getUpdate('0.1.0', 'darwin', 'arm64')).toThrow();
  });
  it('does not downgrade or reinstall the current version', () => {
    const service = setup();
    expect(service.getUpdate('0.2.0', 'darwin', 'arm64')).toBeUndefined();
    expect(service.getUpdate('0.3.0', 'darwin', 'arm64')).toBeUndefined();
  });
  it('rejects malformed input and contradictory policy', () => {
    const service = setup();
    expect(() => service.getUpdate('garbage', 'darwin', 'arm64')).toThrow();
    expect(() => service.getUpdate('0.1.0', 'linux', 'arm64')).toThrow();
    expect(() => service.getUpdate('0.1.0', 'darwin', '../arm64')).toThrow();
    vi.stubEnv('MARKFIX_MINIMUM_DESKTOP_VERSION', '0.3.0');
    expect(() => service.getUpdate('0.1.0', 'darwin', 'arm64')).toThrow();
  });
  it.each([
    '',
    'http://example.com/app.zip',
    'file:///tmp/app.zip',
    'https://user:secret@example.com/app.zip',
    'https://example.com/app.dmg',
    'invalid',
  ])('rejects unpublished or unsafe archive %s', (url) => {
    const service = setup();
    vi.stubEnv('MARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL', url);
    expect(() => service.getUpdate('0.1.0', 'darwin', 'arm64')).toThrow();
  });
});

it('serves the public native protocol with JSON, no-cache, and an empty 204', async () => {
  setup();
  class UpdateHttpModule {}
  Module({
    controllers: [AppController],
    providers: [
      ClientPolicyService,
      ...[AppService, AuthService, AuthRateLimitService, SubscriptionService].map((provide) => ({
        provide,
        useValue: {},
      })),
      { provide: APP_GUARD, useClass: AuthGuard },
    ],
  })(UpdateHttpModule);
  const app = await NestFactory.create<NestFastifyApplication>(
    UpdateHttpModule,
    new FastifyAdapter(),
    { logger: false },
  );
  try {
    await app.init();
    const inject = (version: string) =>
      app.inject({
        method: 'GET',
        url: `/v1/desktop-updates?version=${version}&platform=darwin&arch=arm64`,
      });
    vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL', 'https://example.com/windows.exe');
    vi.stubEnv('MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION', '0.3.0');
    const windowsPolicy = await app.inject({
      method: 'GET',
      url: '/v1/client-policy?version=0.1.0&platform=win32&arch=x64',
    });
    expect(windowsPolicy.statusCode).toBe(200);
    expect(windowsPolicy.json()).toMatchObject({
      downloadUrl: 'https://example.com/windows.exe',
      recommendedVersion: '0.3.0',
    });
    windowsSetup();
    const windowsFeed = await app.inject({
      method: 'GET',
      url: '/v1/desktop-updates/windows/x64/latest.yml',
    });
    expect(windowsFeed.statusCode).toBe(200);
    expect(windowsFeed.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(windowsFeed.body)).toMatchObject({ version: '0.3.0' });
    const update = await inject('0.1.0');
    expect(update.statusCode).toBe(200);
    expect(update.json()).toEqual({ url: 'https://example.com/0.2.0-arm64.zip', name: '0.2.0' });
    expect(update.headers['cache-control']).toBe('no-store');
    const current = await inject('0.2.0');
    expect(current.statusCode).toBe(204);
    expect(current.body).toBe('');
    expect((await inject('invalid')).statusCode).toBe(409);
    vi.stubEnv('MARKFIX_DESKTOP_MAC_ARM64_UPDATE_URL', '');
    expect((await inject('0.1.0')).statusCode).toBe(503);
  } finally {
    await app.close();
  }
});

function windowsSetup() {
  vi.stubEnv('MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION', '0.3.0');
  vi.stubEnv(
    'MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL',
    'https://example.com/MarkFix-0.3.0-windows-x64-setup.exe',
  );
  vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SHA512', Buffer.alloc(64, 1).toString('base64'));
  vi.stubEnv('MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SIZE', '1234');
  return new ClientPolicyService();
}
it('uses the Windows policy and verified package metadata for the NSIS feed', () => {
  const service = windowsSetup();
  expect(service.getWindowsUpdate()).toMatchObject({
    version: '0.3.0',
    files: [
      {
        url: 'https://example.com/MarkFix-0.3.0-windows-x64-setup.exe',
        size: 1234,
        sha512: Buffer.alloc(64, 1).toString('base64'),
      },
    ],
  });
  vi.stubEnv('MARKFIX_WINDOWS_RECOMMENDED_DESKTOP_VERSION', '0.4.0');
  expect(() => service.getWindowsUpdate()).toThrow('does not match');
});
it.each([
  ['MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SHA512', ''],
  ['MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SHA512', 'invalid'],
  ['MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SIZE', '0'],
  ['MARKFIX_DESKTOP_WINDOWS_X64_UPDATE_SIZE', 'NaN'],
  [
    'MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL',
    'http://example.com/MarkFix-0.3.0-windows-x64-setup.exe',
  ],
  [
    'MARKFIX_DESKTOP_WINDOWS_X64_DOWNLOAD_URL',
    'https://user:password@example.com/MarkFix-0.3.0-windows-x64-setup.exe',
  ],
])('rejects unsafe or incomplete update metadata %s', (name, value) => {
  const service = windowsSetup();
  vi.stubEnv(name, value);
  expect(() => service.getWindowsUpdate()).toThrow();
});
