// @vitest-environment jsdom

import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useSyncExternalStore, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalSidebarProjectDecoration } from "@get-bb/plugin-sdk";
import {
  parseSidebarProjectDecoration,
  PluginSidebarProjectDecorationProviders,
  publishSidebarProjectDecoration,
  resetSidebarProjectDecorationsForTest,
  useSidebarProjectDecoration,
} from "./plugin-sidebar-project-decorations";
import {
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "./plugin-slots";
import { makePluginRegistrationSet } from "@/test/fixtures/plugins";

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

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <>
      <PluginSidebarProjectDecorationProviders />
      {children}
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetSidebarProjectDecorationsForTest();
  resetPluginSlotStoreForTest();
});

describe("sidebar project decorations", () => {
  it("drops invalid colors, empty classes, and a tint without a color", () => {
    vi.stubGlobal("CSS", {
      supports: (property: string, value: string) =>
        property === "color" && value !== "not-a-color",
    });

    expect(parseSidebarProjectDecoration(null)).toBeNull();
    expect(parseSidebarProjectDecoration({ tint: true })).toBeNull();
    expect(
      parseSidebarProjectDecoration({
        accentColor: "not-a-color",
        labelClassName: "  ",
        tint: true,
        leading: false,
      }),
    ).toBeNull();
    expect(
      parseSidebarProjectDecoration({
        accentColor: " oklch(0.8 0.1 250) ",
        labelClassName: 7 as never,
        tint: "yes" as never,
      }),
    ).toEqual({
      leading: null,
      accentColor: "oklch(0.8 0.1 250)",
      labelClassName: null,
      tint: false,
    });
    expect(
      parseSidebarProjectDecoration({
        leading: "🚀",
        accentColor: "not-a-color",
        tint: true,
      }),
    ).toEqual({
      leading: "🚀",
      accentColor: null,
      labelClassName: null,
      tint: false,
    });
  });

  it("merges every plugin's leading node and takes style from the first plugin by id", () => {
    const { result } = renderHook(() => useSidebarProjectDecoration("proj_a"));
    act(() => {
      publishSidebarProjectDecoration("zeta", "badge", "proj_a", {
        leading: <span>Z</span>,
        accentColor: "red",
        tint: true,
      });
      publishSidebarProjectDecoration("alpha", "emoji", "proj_a", {
        leading: <span>A</span>,
      });
      publishSidebarProjectDecoration("beta", "accent", "proj_a", {
        accentColor: "blue",
        labelClassName: "italic",
      });
      publishSidebarProjectDecoration("alpha", "emoji", "proj_b", {
        leading: <span>B</span>,
      });
    });

    expect(result.current).toMatchObject({
      accentColor: "blue",
      labelClassName: "italic",
      tint: false,
    });
    const { container } = render(<>{result.current?.leading}</>);
    expect(container.textContent).toBe("AZ");
    expect(
      Array.from(container.querySelectorAll("[data-bb-plugin]"), (element) =>
        element.getAttribute("data-bb-plugin"),
      ),
    ).toEqual(["alpha", "zeta"]);
  });

  it("runs a plugin's hook only for requested projects and withdraws on unregister", () => {
    const accent = createSource("red");
    const calls: string[] = [];
    const useDecoration = (
      projectId: string,
    ): ExperimentalSidebarProjectDecoration | null => {
      calls.push(projectId);
      const color = accent.use();
      return projectId === "proj_a" ? { accentColor: color, tint: true } : null;
    };
    setPluginSlotRegistrations(
      "project-emoji",
      makePluginRegistrationSet({
        sidebarProjectDecorations: [
          { id: "emoji", title: "Project emoji", useDecoration },
        ],
      }),
    );
    const { result } = renderHook(() => useSidebarProjectDecoration("proj_a"), {
      wrapper: Wrapper,
    });

    expect(new Set(calls)).toEqual(new Set(["proj_a"]));
    expect(result.current).toMatchObject({ accentColor: "red", tint: true });
    act(() => accent.set("green"));
    expect(result.current?.accentColor).toBe("green");

    act(() =>
      setPluginSlotRegistrations("project-emoji", makePluginRegistrationSet()),
    );
    expect(result.current).toBeNull();
  });

  it("withdraws a crashing plugin's decorations", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const crash = createSource(false);
    const useDecoration = () => {
      if (crash.use()) throw new Error("boom");
      return { accentColor: "red" };
    };
    setPluginSlotRegistrations(
      "project-emoji",
      makePluginRegistrationSet({
        sidebarProjectDecorations: [
          { id: "emoji", title: "Project emoji", useDecoration },
        ],
      }),
    );
    const { result } = renderHook(() => useSidebarProjectDecoration("proj_a"), {
      wrapper: Wrapper,
    });
    expect(result.current?.accentColor).toBe("red");

    act(() => crash.set(true));
    expect(result.current).toBeNull();
  });
});
