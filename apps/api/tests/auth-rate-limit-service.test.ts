import { describe, expect, it } from 'vitest';
import { AuthRateLimitService } from '../src/auth-rate-limit.service.js';

describe('AuthRateLimitService', () => {
  it('blocks requests after the configured limit', () => {
    const service = new AuthRateLimitService();
    service.consume('login', '127.0.0.1', 2, 60_000, 1_000);
    service.consume('login', '127.0.0.1', 2, 60_000, 2_000);

    expect(() => service.consume('login', '127.0.0.1', 2, 60_000, 3_000)).toThrow(
      'Too many requests',
    );
  });

  it('resets a bucket after its window ends', () => {
    const service = new AuthRateLimitService();
    service.consume('register', '127.0.0.1', 1, 1_000, 1_000);

    expect(() => service.consume('register', '127.0.0.1', 1, 1_000, 2_000)).not.toThrow();
  });

  it('keeps independent actions and clients isolated', () => {
    const service = new AuthRateLimitService();
    service.consume('login', 'client-a', 1, 60_000, 1_000);

    expect(() => service.consume('forgot', 'client-a', 1, 60_000, 2_000)).not.toThrow();
    expect(() => service.consume('login', 'client-b', 1, 60_000, 2_000)).not.toThrow();
  });
});
