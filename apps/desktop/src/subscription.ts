import type { SubscriptionUpgradeResult, AccountSubscription } from '@markfix/api-client';

export const subscriptionIpcChannels = {
  get: 'subscription:get',
  upgrade: 'subscription:upgrade',
} as const;

export type SubscriptionBridge = {
  getSubscription(): Promise<AccountSubscription>;
  requestSubscriptionUpgrade(): Promise<SubscriptionUpgradeResult>;
};
