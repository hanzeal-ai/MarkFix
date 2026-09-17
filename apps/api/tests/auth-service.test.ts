import { afterEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth-crypto.js';
import { AuthService } from '../src/auth.service.js';

describe('authentication service', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([new Date(), null])(
    'logs in with the correct password when emailVerifiedAt is %s',
    async (emailVerifiedAt) => {
      const findUnique = vi.fn().mockResolvedValue({
        id: crypto.randomUUID(),
        email: 'admin@markfix.local',
        passwordHash: await hashPassword('admin'),
        emailVerifiedAt,
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
    },
  );

  it('rejects an incorrect password for an unverified account without creating a session', async () => {
    const create = vi.fn();
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: crypto.randomUUID(),
          email: 'new@example.test',
          passwordHash: await hashPassword('correct-password'),
          emailVerifiedAt: null,
        }),
      },
      authSession: { create },
    };
    const service = new AuthService(database as never, {} as never);

    await expect(
      service.login({ email: 'new@example.test', password: 'wrong-password' }),
    ).rejects.toThrow('Invalid email or password');
    expect(create).not.toHaveBeenCalled();
    expect(database.user.findUnique).toHaveBeenCalledWith({ where: { email: 'new@example.test' } });
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

  it('deletes a password-confirmed account and its private project', async () => {
    const userId = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    const projectDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const userDelete = vi.fn().mockResolvedValue({});
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          passwordHash: await hashPassword('correct-password'),
        }),
      },
      project: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: projectId, name: 'Private', _count: { memberships: 1 } }]),
      },
      artifact: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn().mockImplementation(async (operation) =>
        operation({
          project: { deleteMany: projectDeleteMany },
          user: { delete: userDelete },
        }),
      ),
    };
    const service = new AuthService(database as never, {} as never);

    await expect(service.deleteAccount(userId, { password: 'correct-password' })).resolves.toEqual({
      deleted: true,
    });
    expect(projectDeleteMany).toHaveBeenCalledWith({ where: { id: { in: [projectId] } } });
    expect(userDelete).toHaveBeenCalledWith({ where: { id: userId } });
  });

  it('keeps accounts that still own a project with other members', async () => {
    const userId = crypto.randomUUID();
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: userId,
          passwordHash: await hashPassword('correct-password'),
        }),
      },
      project: {
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

  it('changes the password with a compare-and-set and revokes other sessions and reset tokens', async () => {
    const userId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const currentHash = await hashPassword('current-password');
    const userUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const sessionUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const resetUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = {
      user: { updateMany: userUpdateMany },
      authSession: { updateMany: sessionUpdateMany },
      passwordResetToken: { updateMany: resetUpdateMany },
    };
    const database = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: userId, passwordHash: currentHash }) },
      $transaction: vi.fn().mockImplementation((operation) => operation(transaction)),
    };
    const service = new AuthService(database as never, {} as never);

    await expect(
      service.changePassword(userId, sessionId, {
        currentPassword: 'current-password',
        newPassword: 'next-password',
      }),
    ).resolves.toEqual({ changed: true });

    expect(userUpdateMany).toHaveBeenCalledWith({
      where: { id: userId, passwordHash: currentHash },
      data: { passwordHash: expect.any(String) },
    });
    expect(sessionUpdateMany).toHaveBeenCalledWith({
      where: { userId, id: { not: sessionId }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(resetUpdateMany).toHaveBeenCalledWith({
      where: { userId, consumedAt: null },
      data: { consumedAt: expect.any(Date) },
    });
  });

  it.each([null, [], 'password', 42])('rejects non-object password input: %j', async (input) => {
    const database = { user: { findUnique: vi.fn() }, $transaction: vi.fn() };
    const service = new AuthService(database as never, {} as never);

    await expect(service.changePassword('user', 'session', input)).rejects.toThrow(
      '10-character password',
    );
    expect(database.user.findUnique).not.toHaveBeenCalled();
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an incorrect or oversized current password without updating credentials', async () => {
    const database = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user',
          passwordHash: await hashPassword('current-password'),
        }),
      },
      $transaction: vi.fn(),
    };
    const service = new AuthService(database as never, {} as never);

    await expect(
      service.changePassword('user', 'session', {
        currentPassword: 'x'.repeat(201),
        newPassword: 'next-password',
      }),
    ).rejects.toThrow('Current password is incorrect');
    await expect(
      service.changePassword('user', 'session', {
        currentPassword: 'incorrect-password',
        newPassword: 'next-password',
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(database.$transaction).not.toHaveBeenCalled();
  });

  it('rejects password reuse and a concurrent credential update', async () => {
    const currentHash = await hashPassword('current-password');
    const database = {
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'user', passwordHash: currentHash }) },
      $transaction: vi.fn().mockImplementation((operation) =>
        operation({
          user: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          authSession: { updateMany: vi.fn() },
          passwordResetToken: { updateMany: vi.fn() },
        }),
      ),
    };
    const service = new AuthService(database as never, {} as never);

    await expect(
      service.changePassword('user', 'session', {
        currentPassword: 'current-password',
        newPassword: 'current-password',
      }),
    ).rejects.toThrow('must be different');
    await expect(
      service.changePassword('user', 'session', {
        currentPassword: 'current-password',
        newPassword: 'next-password',
      }),
    ).rejects.toThrow('while this request was in progress');
  });
});
