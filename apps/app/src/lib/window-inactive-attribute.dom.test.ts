// @vitest-environment jsdom

import type { BbDesktopWindowStateChangeHandler } from "@bb/desktop-contract";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installWindowInactiveAttribute,
  WINDOW_INACTIVE_ATTRIBUTE,
  WINDOW_INACTIVE_DELAY_MS,
} from "./window-inactive-attribute";

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

function inactive(): boolean {
  return document.documentElement.hasAttribute(WINDOW_INACTIVE_ATTRIBUTE);
}

describe("installWindowInactiveAttribute", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });

  afterEach(() => {
    Reflect.deleteProperty(document, "visibilityState");
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("marks the root only after the window stays blurred for the delay", () => {
    const dispose = installWindowInactiveAttribute({
      root: document.documentElement,
      desktopApi: null,
    });

    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS - 1);
    window.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(false);

    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(true);

    window.dispatchEvent(new Event("focus"));
    expect(inactive()).toBe(false);

    setVisibility("hidden");
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(true);
    setVisibility("visible");
    expect(inactive()).toBe(false);

    window.dispatchEvent(new Event("blur"));
    dispose();
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(false);
  });

  it("follows native desktop window focus instead of page focus", async () => {
    const listeners: BbDesktopWindowStateChangeHandler[] = [];
    const emitWindowState = (isFocused: boolean): void => {
      for (const listener of listeners) {
        listener({ isFullScreen: false, isFocused });
      }
    };
    const unsubscribe = vi.fn();
    const dispose = installWindowInactiveAttribute({
      root: document.documentElement,
      desktopApi: {
        getWindowState: async () => ({ isFullScreen: false, isFocused: false }),
        onWindowStateChange(listener) {
          listeners.push(listener);
          return unsubscribe;
        },
      },
    });
    await vi.advanceTimersByTimeAsync(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(true);

    emitWindowState(true);
    expect(inactive()).toBe(false);

    window.dispatchEvent(new Event("blur"));
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(false);

    emitWindowState(false);
    vi.advanceTimersByTime(WINDOW_INACTIVE_DELAY_MS);
    expect(inactive()).toBe(true);

    dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(inactive()).toBe(false);
  });
});
