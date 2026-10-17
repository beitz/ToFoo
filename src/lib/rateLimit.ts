/**
 * Keep requests to an online service under its published rate limit: at most `limit` requests in
 * any `windowMs`. A request over the limit waits for a free slot instead of failing, because going
 * over can get the user's IP address blocked.
 */

/** How long a request at `now` must wait, given the start times of earlier requests. Pure. */
export function waitFor(sent: readonly number[], now: number, limit: number, windowMs: number): number {
  const recent = sent.filter((t) => t > now - windowMs).sort((a, b) => a - b);
  if (recent.length < limit) return 0;
  // The slot frees when the oldest request that still counts leaves the window.
  return recent[recent.length - limit]! + windowMs - now;
}

export interface RateLimiter {
  /** Resolves when a request may be sent, and counts it as sent. */
  take(): Promise<void>;
}

export function createRateLimiter(
  limit: number,
  windowMs: number,
  clock: () => number = () => Date.now(),
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): RateLimiter {
  let sent: number[] = [];
  // Requests take their slots one after another, so two waiting at once cannot both claim the same one.
  let queue: Promise<void> = Promise.resolve();
  return {
    take() {
      const turn = queue.then(async () => {
        const delay = waitFor(sent, clock(), limit, windowMs);
        if (delay > 0) await sleep(delay);
        const now = clock();
        sent = [...sent.filter((t) => t > now - windowMs), now];
      });
      queue = turn;
      return turn;
    },
  };
}
