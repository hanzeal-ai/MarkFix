import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth-crypto.js';
import { AuthService } from '../src/auth.service.js';

describe('authentication service', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('maps the local demo username to its internal email account', async () => {
    vi.stubEnv('MARKFIX_DEMO_USERNAME', 'admin');
    vi.stubEnv('MARKFIX_DEMO_EMAIL', 'admin@markfix.local');
    const findUnique = vi.fn().mockResolvedValue({
      id: crypto.randomUUID(),
      email: 'admin@markfix.local',
      passwordHash: await hashPassword('admin'),
      emailVerifiedAt: new Date(),
    });
    const database = {
      user: { findUnique },
      authSession: {
        create: vi.fn().mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    const service = new AuthService(database as never, {} as never);

    const result = await service.login({ email: 'admin', password: 'admin' });

    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'admin@markfix.local' } });
    expect(result).toMatchObject({ expiresIn: 900 });
  });
});
