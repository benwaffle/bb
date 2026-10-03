// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalSidebarThreadGroup } from "@get-bb/plugin-sdk";
import {
  PluginSidebarThreadGroupProviders,
  publishSidebarThreadGroups,
  resetSidebarThreadGroupsForTest,
  useSidebarThreadGroups,
} from "./plugin-sidebar-thread-groups";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "./plugin-slots";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";

function group(
  key: string,
  overrides: Partial<ExperimentalSidebarThreadGroup> = {},
): ExperimentalSidebarThreadGroup {
  return {
    projectId: "proj_hss",
    key,
    label: key,
    threadIds: [],
    rows: [],
    ...overrides,
  };
}

function createSource<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const getSnapshot = () => value;
  return {
    use: () => useSyncExternalStore(subscribe, getSnapshot),
    set(next: T) {
      value = next;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  cleanup();
  resetSidebarThreadGroupsForTest();
  resetPluginSlotStoreForTest();
});

describe("sidebar thread groups", () => {
  it("namespaces groups per provider in plugin id order and drops malformed entries", () => {
    const { result } = renderHook(() => useSidebarThreadGroups());
    act(() => {
      publishSidebarThreadGroups("zeta", "tickets", [group("CORE-1")]);
      publishSidebarThreadGroups("alpha", "tickets", [
        group("CORE-2", {
          threadIds: ["thr_a", 7 as never, ""],
          rows: [
            { id: "pr-1", title: "#1", onSelect: () => undefined },
            { id: "pr-1", title: "duplicate", onSelect: () => undefined },
            { id: "pr-2", title: "#2" } as never,
          ],
        }),
        group("CORE-2"),
        { key: "missing-project" },
        null,
      ]);
    });

    expect(
      result.current.map(({ id, pluginId, threadIds, rows }) => ({
        id,
        pluginId,
        threadIds,
        rows: rows.map((row) => ("threadId" in row ? row.threadId : row.title)),
      })),
    ).toEqual([
      {
        id: "alpha/tickets:CORE-2",
        pluginId: "alpha",
        threadIds: ["thr_a"],
        rows: ["#1"],
      },
      {
        id: "zeta/tickets:CORE-1",
        pluginId: "zeta",
        threadIds: [],
        rows: [],
      },
    ]);
  });

  it("merges placed threads into threadIds, keeps valid decorations, and defaults keepOrder", () => {
    const { result } = renderHook(() => useSidebarThreadGroups());
    act(() => {
      publishSidebarThreadGroups("pr-review", "tickets", [
        group("CORE-4", {
          threadIds: ["thr_base", "thr_top"],
          rows: [
            { id: "pr-1", title: "#1 Base", onSelect: () => undefined },
            { threadId: "thr_top", depth: 1, description: "stacked on #1" },
            { threadId: "thr_top", depth: 2 },
            { threadId: "thr_extra", depth: 1.5, description: 3 as never },
            { threadId: "" },
          ],
          keepOrder: true,
        }),
        group("CORE-5"),
      ]);
    });

    const [stacked, plain] = result.current;
    expect(stacked?.keepOrder).toBe(true);
    expect(stacked?.threadIds).toEqual(["thr_base", "thr_top", "thr_extra"]);
    expect(stacked?.rows).toEqual([
      expect.objectContaining({ id: "pr-1" }),
      { threadId: "thr_top", depth: 1, description: "stacked on #1" },
      { threadId: "thr_extra" },
    ]);
    expect(plain?.keepOrder).toBe(false);
  });

  it("runs a provider's hook in the plugin and withdraws its groups on unregister", () => {
    const source = createSource<ExperimentalSidebarThreadGroup[]>([
      group("CORE-21", { threadIds: ["thr_review"] }),
    ]);
    const useGroups = () => source.use();
    setPluginSlotRegistrations(
      "pr-review",
      makePluginRegistrationSet({
        sidebarThreadGroups: [{ id: "tickets", title: "Tickets", useGroups }],
      }),
    );
    function Wrapper({ children }: { children: ReactNode }) {
      return (
        <>
          <PluginSidebarThreadGroupProviders />
          {children}
        </>
      );
    }
    const { result } = renderHook(() => useSidebarThreadGroups(), {
      wrapper: Wrapper,
    });

    expect(result.current.map((entry) => entry.id)).toEqual([
      "pr-review/tickets:CORE-21",
    ]);
    act(() => source.set([group("CORE-22")]));
    expect(result.current.map((entry) => entry.id)).toEqual([
      "pr-review/tickets:CORE-22",
    ]);

    act(() =>
      setPluginSlotRegistrations("pr-review", makePluginRegistrationSet()),
    );
    expect(result.current).toEqual([]);
  });

  it("withdraws a crashing provider's groups", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crash = createSource(false);
    const useGroups = () => {
      if (crash.use()) throw new Error("boom");
      return [group("CORE-3")];
    };
    setPluginSlotRegistrations(
      "pr-review",
      makePluginRegistrationSet({
        sidebarThreadGroups: [{ id: "tickets", title: "Tickets", useGroups }],
      }),
    );
    render(<PluginSidebarThreadGroupProviders />);
    const { result } = renderHook(() => useSidebarThreadGroups());
    expect(result.current).toHaveLength(1);

    act(() => crash.set(true));
    expect(result.current).toEqual([]);
  });
});
