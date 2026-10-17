import { describe, expect, it } from 'vitest';
import { createRateLimiter, waitFor } from './rateLimit';

describe('waitFor', () => {
  it('lets requests through under the limit and waits for the oldest to leave the window', () => {
    expect(waitFor([], 0, 2, 60_000)).toBe(0);
    expect(waitFor([1000], 2000, 2, 60_000)).toBe(0);
    expect(waitFor([1000, 5000], 10_000, 2, 60_000)).toBe(51_000);
    // Requests older than the window no longer count.
    expect(waitFor([1000, 5000, 30_000], 62_000, 2, 60_000)).toBe(3000);
    expect(waitFor([1000, 5000, 30_000], 66_000, 2, 60_000)).toBe(0);
  });
});

describe('createRateLimiter', () => {
  it('spaces requests out once the limit is reached, in the order they came', async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = createRateLimiter(2, 60_000, () => now, async (ms) => {
      slept.push(ms);
      now += ms;
    });
    const order: number[] = [];
    await Promise.all([1, 2, 3, 4].map((i) => limiter.take().then(() => order.push(i))));
    expect(order).toEqual([1, 2, 3, 4]);
    expect(slept).toEqual([60_000]);
    expect(now).toBe(60_000);
  });
});
