import type { Anchor } from '@markfix/contracts';

export const anchorsEqual = (left: Anchor | undefined, right: Anchor): boolean =>
  left !== undefined && JSON.stringify(left) === JSON.stringify(right);
