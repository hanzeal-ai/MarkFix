export const retryDelayMs = (attempts: number): number =>
  Math.min(5 * 60_000, 1000 * 2 ** Math.min(9, attempts));
