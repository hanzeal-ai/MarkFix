import { beforeEach, expect, it, vi } from 'vitest';
import { MarkFixApi } from '@markfix/api-client';
import { DesktopSessionManager } from '../src/main/session-manager.js';
const files = vi.hoisted(() => ({ credential: 'refresh-a', reads: 0 }));
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => {
    files.reads++;
    return Buffer.from(files.credential);
  }),
  writeFile: vi.fn(async (_path: string, content: Buffer) => {
    files.credential = content.toString();
  }),
  unlink: vi.fn(async () => {
    files.credential = '';
  }),
}));
vi.mock('electron', () => ({
  app: { getPath: () => '/test' },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(value),
    decryptString: (value: Buffer) => value.toString(),
  },
}));
beforeEach(() => {
  files.credential = 'refresh-a';
  files.reads = 0;
  vi.unstubAllGlobals();
});
it('does not clear new-account credentials when an old restore is rejected', async () => {
  let release!: (response: Response) => void;
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const api = new MarkFixApi('https://example.test');
  const session = new DesktopSessionManager(api);
  const old = session.restore();
  const duplicate = session.restore();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  api.setTokens({ accessToken: 'b', refreshToken: 'refresh-b' });
  await session.saveRefreshToken('refresh-b');
  release(Response.json({ accessToken: 'late-a', refreshToken: 'late-refresh-a', expiresIn: 900 }));
  expect(await old).toBeUndefined();
  expect(await duplicate).toBeUndefined();
  expect(api.currentRefreshToken()).toBe('refresh-b');
  expect(files.credential).toBe('refresh-b');
  expect(files.reads).toBe(1);
});
it('shares a successful restore between concurrent callers', async () => {
  const fetchMock = vi.fn(async (input: string | URL | Request) =>
    String(input).endsWith('/refresh')
      ? Response.json({ accessToken: 'a', refreshToken: 'next-a', expiresIn: 900 })
      : Response.json({ id: 'a', email: 'a@example.test', displayName: 'A', emailVerified: true }),
  );
  vi.stubGlobal('fetch', fetchMock);
  const session = new DesktopSessionManager(new MarkFixApi('https://example.test'));
  const [a, b] = await Promise.all([session.restore(), session.restore()]);
  expect(a?.id).toBe('a');
  expect(b).toEqual(a);
  expect(files.credential).toBe('next-a');
  expect(files.reads).toBe(1);
});
