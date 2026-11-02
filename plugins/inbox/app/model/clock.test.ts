import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTicker, MINUTE_MS } from "./clock.js";

describe("createTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs one shared interval only while someone is subscribed", () => {
    const ticker = createTicker(MINUTE_MS);
    expect(vi.getTimerCount()).toBe(0);
    const first = vi.fn();
    const second = vi.fn();
    const stopFirst = ticker.subscribe(first);
    const stopSecond = ticker.subscribe(second);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(MINUTE_MS);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(ticker.now()).toBe(Date.now());

    stopFirst();
    expect(vi.getTimerCount()).toBe(1);
    stopSecond();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("refreshes its time when the first subscriber arrives after idling", () => {
    const ticker = createTicker(MINUTE_MS);
    const created = ticker.now();
    vi.advanceTimersByTime(5 * MINUTE_MS);
    const stop = ticker.subscribe(() => {});
    expect(ticker.now()).toBe(created + 5 * MINUTE_MS);
    stop();
  });
});
