import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth-crypto.js';
import { AuthService } from '../src/auth.service.js';

describe('authentication service', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('logs in with the current email account', async () => {
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

    const result = await service.login({ email: 'ADMIN@markfix.local', password: 'admin' });

    expect(findUnique).toHaveBeenCalledWith({ where: { email: 'admin@markfix.local' } });
    expect(result).toMatchObject({ expiresIn: 900 });
  });

  it('exports account data without credential fields', async () => {
    const account = {
      id: crypto.randomUUID(),
      email: 'admin@markfix.local',
      displayName: 'Admin',
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const empty = { findMany: vi.fn().mockResolvedValue([]) };
    const database = {
      user: { findUnique: vi.fn().mockResolvedValue(account) },
      membership: empty,
      report: empty,
      managedAnnotation: empty,
      comment: empty,
      activity: empty,
      authSession: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new AuthService(database as never, {} as never);

    const result = await service.exportData(account.id);

    expect(result.account).toEqual(account);
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('refreshTokenHash');
  });

  it('deletes a password-confirmed account and its private workspace', async () => {
    const userId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const workspaceDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const userDelete = vi.fn().mockResolvedValue({});
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          passwordHash: await hashPassword('correct-password'),
        }),
      },
      workspace: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: workspaceId, name: 'Private', _count: { memberships: 1 } }]),
      },
      artifact: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation(async (operation) =>
        operation({
          workspace: { deleteMany: workspaceDeleteMany },
          user: { delete: userDelete },
        }),
      ),
    };
    const service = new AuthService(database as never, {} as never);

    await expect(service.deleteAccount(userId, { password: 'correct-password' })).resolves.toEqual({
      deleted: true,
    });
    expect(workspaceDeleteMany).toHaveBeenCalledWith({ where: { id: { in: [workspaceId] } } });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: userId } });
  });

  it('keeps accounts that still own a workspace with other members', async () => {
    const userId = crypto.randomUUID();
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          passwordHash: await hashPassword('correct-password'),
        }),
      },
      workspace: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            { id: crypto.randomUUID(), name: 'Shared', _count: { memberships: 2 } },
          ]),
      },
      $transaction: vi.fn(),
    };
    const service = new AuthService(database as never, {} as never);

    await expect(service.deleteAccount(userId, { password: 'correct-password' })).rejects.toThrow(
      'Transfer or remove members',
    );
    expect(database.$transaction).not.toHaveBeenCalled();
  });
});
