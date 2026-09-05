import { describe, expect, it, vi } from 'vitest';
import { SubscriptionService } from '../src/subscription.service.js';

const membership = { status: 'ACTIVE', role: 'OWNER' };

describe('SubscriptionService', () => {
  it('returns plan limits and current usage', async () => {
    const service = new SubscriptionService({
      membership: { findUnique: vi.fn().mockResolvedValue(membership) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          plan: 'FREE',
          upgradeRequestedAt: null,
          _count: { projects: 2, memberships: 1 },
        }),
      },
    } as never);

    await expect(service.getSubscription('user-1', 'workspace-1')).resolves.toEqual({
      plan: 'FREE',
      planName: '个人版',
      projectLimit: 3,
      memberLimit: 1,
      usage: { projects: 2, members: 1 },
      upgradeRequestedAt: null,
    });
  });

  it('enforces free project and member limits', async () => {
    const service = new SubscriptionService({
      membership: { findUnique: vi.fn().mockResolvedValue(membership) },
      workspace: {
        findUnique: vi.fn().mockResolvedValue({
          plan: 'FREE',
          upgradeRequestedAt: null,
          _count: { projects: 3, memberships: 1 },
        }),
      },
    } as never);

    await expect(service.assertCanCreateProject('user-1', 'workspace-1')).rejects.toThrow(
      'Project limit reached',
    );
    await expect(service.assertCanInviteMember('user-1', 'workspace-1')).rejects.toThrow(
      'Member limit reached',
    );
  });

  it('upgrades the local showcase plan only when explicitly enabled', async () => {
    const previous = process.env.MARKFIX_ALLOW_SELF_SERVICE_PLAN_UPGRADE;
    process.env.MARKFIX_ALLOW_SELF_SERVICE_PLAN_UPGRADE = 'true';
    const update = vi.fn().mockResolvedValue({});
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({
        plan: 'FREE',
        upgradeRequestedAt: null,
        _count: { projects: 1, memberships: 1 },
      })
      .mockResolvedValueOnce({
        plan: 'TEAM',
        upgradeRequestedAt: null,
        _count: { projects: 1, memberships: 1 },
      });
    const service = new SubscriptionService({
      membership: { findUnique: vi.fn().mockResolvedValue(membership) },
      workspace: { findUnique, update },
    } as never);

    try {
      await expect(service.requestUpgrade('user-1', 'workspace-1')).resolves.toMatchObject({
        plan: 'TEAM',
        upgraded: true,
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'workspace-1' },
        data: { plan: 'TEAM', upgradeRequestedAt: null },
      });
    } finally {
      if (previous === undefined) delete process.env.MARKFIX_ALLOW_SELF_SERVICE_PLAN_UPGRADE;
      else process.env.MARKFIX_ALLOW_SELF_SERVICE_PLAN_UPGRADE = previous;
    }
  });

  it('allows only the workspace owner to manage the subscription', async () => {
    const service = new SubscriptionService({
      membership: {
        findUnique: vi.fn().mockResolvedValue({ status: 'ACTIVE', role: 'MEMBER' }),
      },
      workspace: { findUnique: vi.fn(), update: vi.fn() },
    } as never);

    await expect(service.requestUpgrade('user-1', 'workspace-1')).rejects.toThrow(
      'Only the workspace owner',
    );
  });
});
