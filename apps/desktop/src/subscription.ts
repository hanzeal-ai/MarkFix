import type { SubscriptionUpgradeResult, WorkspaceSubscription } from '@markfix/api-client';

export const subscriptionIpcChannels = {
  get: 'subscription:get',
  upgrade: 'subscription:upgrade',
} as const;

export type SubscriptionBridge = {
  getSubscription(workspaceId: string): Promise<WorkspaceSubscription>;
  requestSubscriptionUpgrade(workspaceId: string): Promise<SubscriptionUpgradeResult>;
};
