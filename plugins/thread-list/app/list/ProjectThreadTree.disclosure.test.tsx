// @vitest-environment jsdom

import { ThreadRowNavigationProvider } from "../rows/threadRowNavigation.js";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { SidebarRenameProvider } from "../rows/SidebarInlineRename.js";
import { FlatThreadListContext } from "../rows/flatThreadRows.js";
import { makeSidebarThread } from "../model/fixtures.js";
import {
  buildFlatThreadGroups,
  compareStandardThreads,
} from "../model/project-thread-groups.js";

installTestPluginRuntime();
const { ProjectThreadTree } = await import("./ProjectRow.js");

function Slot({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <ThreadRowNavigationProvider>
        <SidebarRenameProvider>{children}</SidebarRenameProvider>
      </ThreadRowNavigationProvider>
    </TooltipProvider>
  );
}

const FLAT_THREADS = [
  makeSidebarThread({ id: "parent", title: "Parent", projectId: "proj_a" }),
  makeSidebarThread({
    id: "child",
    title: "Child",
    projectId: "proj_a",
    parentThreadId: "parent",
  }),
];

function renderFlatTree(collapsedThreadIds: ReadonlySet<string>) {
  const onToggleThreadCollapsed = vi.fn();
  const slot = renderSlot(
    { component: Slot },
    {
      children: (
        <FlatThreadListContext.Provider value={{ dayLabels: false }}>
          <ProjectThreadTree
            rootItems={buildFlatThreadGroups(
              FLAT_THREADS,
              compareStandardThreads,
              false,
            )}
            threadListState={{ status: "ready", threads: FLAT_THREADS }}
            compareThreads={compareStandardThreads}
            collapsedThreadIds={new Set(collapsedThreadIds)}
            collapsedEnvironmentIds={new Set()}
            onToggleThreadCollapsed={onToggleThreadCollapsed}
            onToggleEnvironmentCollapsed={vi.fn()}
          />
        </FlatThreadListContext.Provider>
      ),
    },
    {
      sidebarThreads: { threads: FLAT_THREADS, projects: [] },
      sidebarThreadDecorations: {
        proj_a: { leading: null, title: "App", hue: 230 },
      },
    },
  );
  return { ...slot, onToggleThreadCollapsed };
}

describe("ProjectThreadTree", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows the unavailable state instead of rows when threads cannot load", () => {
    renderSlot(
      { component: Slot },
      {
        children: (
          <ProjectThreadTree
            threadListState={{ status: "unavailable" }}
            compareThreads={() => 0}
            collapsedThreadIds={new Set()}
            collapsedEnvironmentIds={new Set()}
            onToggleThreadCollapsed={vi.fn()}
            onToggleEnvironmentCollapsed={vi.fn()}
          />
        ),
      },
    );

    expect(screen.getByText("Threads unavailable")).not.toBeNull();
  });

  it("nests a flat list's child under its parent on the hued guide line, without its own hue edge", () => {
    const { container } = renderFlatTree(new Set());

    const childLink = screen.getByRole("link", { name: "Open Child" });
    const childRow = childLink.closest<HTMLElement>(
      "[data-sidebar-rename-row]",
    );
    const parentRow = screen
      .getByRole("link", { name: "Open Parent" })
      .closest<HTMLElement>("[data-sidebar-rename-row]");
    expect(childRow?.style.paddingLeft).toBe("26px");
    expect(parentRow?.style.paddingLeft).toBe("12px");
    expect(
      container.querySelector('[data-sidebar-thread-group-line="230"]'),
    ).not.toBeNull();
    const edges = container.querySelectorAll("[data-sidebar-project-hue-edge]");
    expect(edges).toHaveLength(1);
    expect(parentRow?.contains(edges[0] ?? null)).toBe(true);
  });

  it("hides a collapsed flat parent's children and toggles the shared collapse state", () => {
    const { onToggleThreadCollapsed } = renderFlatTree(new Set(["parent"]));

    expect(screen.queryByRole("link", { name: "Open Child" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "Expand Parent threads" }),
    );
    expect(onToggleThreadCollapsed).toHaveBeenCalledWith("parent");
  });
});
