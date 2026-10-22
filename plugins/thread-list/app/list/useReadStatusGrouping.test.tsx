// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeSidebarThread } from "../model/fixtures.js";
import { compareStandardThreads } from "../model/project-thread-groups.js";
import { preferenceValueAtom } from "../preferences/preferences-sync.js";
import { useReadStatusGrouping } from "./useReadStatusGrouping.js";

const THREADS = [
  makeSidebarThread({ id: "parent" }),
  makeSidebarThread({ id: "child", parentThreadId: "parent" }),
  makeSidebarThread({ id: "other-parent" }),
  makeSidebarThread({ id: "other-child", parentThreadId: "other-parent" }),
];

function renderGrouping(
  groupByReadStatus: boolean,
  collapsedThreads: string[],
) {
  const store = createStore();
  store.set(preferenceValueAtom("groupByReadStatus"), groupByReadStatus);
  store.set(preferenceValueAtom("collapsedThreads"), collapsedThreads);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(
    () =>
      useReadStatusGrouping({
        threads: THREADS,
        selectedThreadId: undefined,
        comparator: compareStandardThreads,
      }),
    { wrapper },
  );
  return { store, hook };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe.each([
  { mode: "grouped by read status", groupByReadStatus: true },
  { mode: "ungrouped", groupByReadStatus: false },
])("useReadStatusGrouping $mode", ({ groupByReadStatus }) => {
  it("leaves parents expanded unless the saved state collapses them", () => {
    const { hook } = renderGrouping(groupByReadStatus, ["other-parent"]);

    expect([...hook.result.current.collapsedThreadIds]).toEqual([
      "other-parent",
    ]);
  });

  it("persists toggles to the saved collapse state", () => {
    const { store, hook } = renderGrouping(groupByReadStatus, []);

    act(() => hook.result.current.toggleThreadCollapsed("parent"));

    expect([...hook.result.current.collapsedThreadIds]).toEqual(["parent"]);
    expect(store.get(preferenceValueAtom("collapsedThreads"))).toEqual([
      "parent",
    ]);

    act(() => hook.result.current.toggleThreadCollapsed("parent"));

    expect(hook.result.current.collapsedThreadIds.size).toBe(0);
    expect(store.get(preferenceValueAtom("collapsedThreads"))).toEqual([]);
  });
});
