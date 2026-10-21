// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SidebarStickyGroup, SidebarStickyTier } from "./sidebar.js";

const TIER_HEIGHTS: Record<string, number> = {
  outer: 46,
  middle: 28,
  inner: 28,
};

function stubTierHeights(heights: Record<string, number>) {
  const resizeCallbacks: ResizeObserverCallback[] = [];
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
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      return new DOMRect(0, 0, 200, heights[this.dataset.testid ?? ""] ?? 0);
    },
  );
  return () => {
    for (const callback of resizeCallbacks) {
      callback([], {} as ResizeObserver);
    }
  };
}

function renderNestedTiers() {
  return render(
    <SidebarStickyGroup>
      <SidebarStickyTier tier="project" data-testid="project">
        Project
      </SidebarStickyTier>
      <SidebarStickyGroup>
        <SidebarStickyTier tier="parent" level={0} data-testid="outer">
          Outer
        </SidebarStickyTier>
        <SidebarStickyGroup>
          <SidebarStickyTier tier="parent" level={1} data-testid="middle">
            Middle
          </SidebarStickyTier>
          <SidebarStickyGroup>
            <SidebarStickyTier tier="parent" level={2} data-testid="inner">
              Inner
            </SidebarStickyTier>
          </SidebarStickyGroup>
        </SidebarStickyGroup>
      </SidebarStickyGroup>
    </SidebarStickyGroup>,
  );
}

function offsetOf(container: HTMLElement, testId: string): string {
  return (
    container
      .querySelector<HTMLElement>(`[data-testid="${testId}"]`)
      ?.style.getPropertyValue("--bb-sidebar-sticky-parent-offset") ?? ""
  );
}

describe("SidebarStickyTier parent offsets", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("pins each parent level below the rendered heights of its pinned ancestors", () => {
    stubTierHeights(TIER_HEIGHTS);
    const { container } = renderNestedTiers();

    expect(offsetOf(container, "outer")).toBe("0px");
    expect(offsetOf(container, "middle")).toBe("46px");
    expect(offsetOf(container, "inner")).toBe("74px");
  });

  it("restacks descendants when an ancestor row changes height", () => {
    const heights = { ...TIER_HEIGHTS };
    const resize = stubTierHeights(heights);
    const { container } = renderNestedTiers();

    heights.outer = 28;
    act(() => resize());

    expect(offsetOf(container, "middle")).toBe("28px");
    expect(offsetOf(container, "inner")).toBe("56px");
  });
});
