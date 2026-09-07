export const anchorRecoveryNotice = (status: unknown): string | undefined =>
  status === 'lost'
    ? 'The selected element moved or disappeared. Select it again or use a region.'
    : undefined;
