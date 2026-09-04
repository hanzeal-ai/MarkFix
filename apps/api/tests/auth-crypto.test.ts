import { describe, expect, it } from 'vitest';
import {
  hashOpaqueToken,
  hashPassword,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from '../src/auth-crypto.js';

describe('authentication cryptography', () => {
  it('stores a salted password verifier instead of plaintext', async () => {
    const first = await hashPassword('a secure password');
    const second = await hashPassword('a secure password');

    expect(first).not.toBe(second);
    expect(first).not.toContain('a secure password');
    await expect(verifyPassword('a secure password', first)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', first)).resolves.toBe(false);
  });

  it('signs access claims and rejects tampering or expiry', () => {
    const token = signAccessToken({ sub: 'user-1', sid: 'session-1', exp: 2_000 }, 'secret');

    expect(verifyAccessToken(token, 'secret', 1_000_000)).toMatchObject({ sub: 'user-1' });
    expect(() => verifyAccessToken(`${token}x`, 'secret', 1_000_000)).toThrow();
    expect(() => verifyAccessToken(token, 'secret', 2_000_000)).toThrow();
  });

  it('uses stable one-way hashes for opaque refresh credentials', () => {
    expect(hashOpaqueToken('refresh-token')).toBe(hashOpaqueToken('refresh-token'));
    expect(hashOpaqueToken('refresh-token')).not.toBe('refresh-token');
  });
});
