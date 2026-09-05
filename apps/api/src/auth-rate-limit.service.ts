import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type Bucket = { attempts: number; resetsAtMs: number };

@Injectable()
export class AuthRateLimitService {
  private readonly buckets = new Map<string, Bucket>();

  consume(
    action: string,
    clientId: string,
    limit: number,
    windowMs: number,
    nowMs = Date.now(),
  ): void {
    if (this.buckets.size > 10_000) this.removeExpired(nowMs);
    const key = `${action}:${clientId}`;
    const current = this.buckets.get(key);
    if (!current || current.resetsAtMs <= nowMs) {
      this.buckets.set(key, { attempts: 1, resetsAtMs: nowMs + windowMs });
      return;
    }
    if (current.attempts >= limit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests; try again later',
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetsAtMs - nowMs) / 1000)),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    current.attempts += 1;
  }

  private removeExpired(nowMs: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetsAtMs <= nowMs) this.buckets.delete(key);
    }
  }
}
