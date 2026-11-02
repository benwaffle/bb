export const MINUTE_MS = 60_000;
export const SECOND_MS = 1_000;

export interface Ticker {
  subscribe(listener: () => void): () => void;
  now(): number;
}

export interface InboxClock {
  minutes: Ticker;
  seconds: Ticker;
}

export function createTicker(intervalMs: number): Ticker {
  const listeners = new Set<() => void>();
  let now = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (timer === null) {
        now = Date.now();
        timer = setInterval(() => {
          now = Date.now();
          for (const notify of listeners) notify();
        }, intervalMs);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== null) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    now: () => now,
  };
}

export function createInboxClock(): InboxClock {
  return {
    minutes: createTicker(MINUTE_MS),
    seconds: createTicker(SECOND_MS),
  };
}

export function needsSecondTicks(since: number, now: number): boolean {
  return now - since < MINUTE_MS;
}
