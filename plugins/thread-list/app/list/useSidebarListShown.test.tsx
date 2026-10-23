// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SidebarContentElementContext } from "../ui/sidebar.js";
import { useSidebarListShown } from "./useSidebarListShown.js";

let clientHeight: number;
let scrollElement: HTMLDivElement;
const resizeCallbacks: ResizeObserverCallback[] = [];

function Probe() {
  return <span data-testid="shown">{String(useSidebarListShown())}</span>;
}

function resize(height: number) {
  clientHeight = height;
  act(() => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  });
}

beforeEach(() => {
  resizeCallbacks.length = 0;
  scrollElement = document.createElement("div");
  Object.defineProperty(scrollElement, "clientHeight", {
    configurable: true,
    get: () => clientHeight,
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resizeCallbacks.push(callback);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderProbe(height: number) {
  clientHeight = height;
  render(
    <SidebarContentElementContext.Provider value={{ current: scrollElement }}>
      <Probe />
    </SidebarContentElementContext.Provider>,
  );
}

describe("useSidebarListShown", () => {
  it("waits for the scroll container to gain height before showing the list", () => {
    renderProbe(0);
    expect(screen.getByTestId("shown").textContent).toBe("false");

    resize(500);
    expect(screen.getByTestId("shown").textContent).toBe("true");
  });

  it("keeps the list shown when the scroll container is hidden after it was shown", () => {
    renderProbe(500);
    expect(screen.getByTestId("shown").textContent).toBe("true");

    resize(0);
    expect(screen.getByTestId("shown").textContent).toBe("true");
  });
});
