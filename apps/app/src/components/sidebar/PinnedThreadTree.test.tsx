// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { ThreadListEntry } from "@bb/domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { buildPinnedSidebarState } from "@bb/client-core";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import { PinnedThreadTree } from "./PinnedThreadTree";
import { ProjectThreadTree } from "./ProjectRow";

vi.mock("@/hooks/useThreadSplitsEnabled", () => ({
  useThreadSplitsEnabled: () => false,
}));

vi.mock("@/hooks/usePromptDraftStorage", () => ({
  usePromptDraftHasInput: () => false,
  usePromptDraftInputThreadIds: () => new Set(),
}));

vi.mock("@/components/thread/ThreadActionsProvider", () => ({
  useThreadActions: () => ({
    renameThread: vi.fn(),
    requestRename: vi.fn(),
    requestDelete: vi.fn(),
    archiveThreadAndChildren: vi.fn(),
    unarchiveThread: vi.fn(),
    togglePin: vi.fn(),
    toggleRead: vi.fn(),
  }),
}));

const PARENT_THREAD_ID = "thr_pinned_parent";
const CHILD_COUNT = 3;

function makePinnedFamily(): ThreadListEntry[] {
  return [
    makeThreadListEntry({
      id: PARENT_THREAD_ID,
      title: "Feature orchestrator",
      titleFallback: "Feature orchestrator",
      pinnedAt: 200,
      pinSortKey: "0001",
      createdAt: 200,
      updatedAt: 200,
    }),
    ...Array.from({ length: CHILD_COUNT }, (_unused, index) =>
      makeThreadListEntry({
        id: `thr_pinned_child_${index}`,
        parentThreadId: PARENT_THREAD_ID,
        title: `Worker ${index + 1}`,
        titleFallback: `Worker ${index + 1}`,
        createdAt: 190 - index,
        updatedAt: 190 - index,
      }),
    ),
  ];
}

function renderPinnedTree(threads: ThreadListEntry[]) {
  const { rootNodes } = buildPinnedSidebarState({ threads });
  return render(
    <TooltipProvider>
      <MemoryRouter>
        <PinnedThreadTree
          rootNodes={rootNodes}
          collapsedThreadIds={new Set()}
          collapsedEnvironmentIds={new Set()}
          onToggleThreadCollapsed={vi.fn()}
          onToggleEnvironmentCollapsed={vi.fn()}
        />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

function threadRow(container: HTMLElement, threadId: string): HTMLElement {
  const row = container.querySelector<HTMLElement>(
    `[data-sidebar-thread-id="${threadId}"]`,
  );
  if (!row) throw new Error(`no sidebar row for ${threadId}`);
  return row;
}

describe("PinnedThreadTree layering", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("scopes pinned parent rows out of sticky positioning", () => {
    const { container } = renderPinnedTree(makePinnedFamily());
    const parentTier = threadRow(container, PARENT_THREAD_ID).closest(
      '[data-sidebar-sticky-tier="parent"]',
    );

    expect(parentTier).not.toBeNull();
    expect(parentTier?.closest("[data-sidebar-pinned-tree]")).not.toBeNull();
  });

  it("keeps every pinned child inside its parent's scrolling group", () => {
    const { container } = renderPinnedTree(makePinnedFamily());
    const parentGroup = threadRow(container, PARENT_THREAD_ID).closest(
      "[data-sidebar-sticky-group]",
    );

    expect(parentGroup).not.toBeNull();
    for (let index = 0; index < CHILD_COUNT; index += 1) {
      const childRow = threadRow(container, `thr_pinned_child_${index}`);
      expect(parentGroup?.contains(childRow)).toBe(true);
    }
  });

  it("leaves parent rows outside the pinned section sticky", () => {
    const { container } = render(
      <TooltipProvider>
        <MemoryRouter>
          <ProjectThreadTree
            threadListState={{ status: "ready", threads: makePinnedFamily() }}
            progressiveDisclosureEnabled={false}
            compareThreads={() => 0}
            collapsedThreadIds={new Set()}
            collapsedEnvironmentIds={new Set()}
            variant="section"
            onToggleThreadCollapsed={vi.fn()}
            onToggleEnvironmentCollapsed={vi.fn()}
          />
        </MemoryRouter>
      </TooltipProvider>,
    );
    const parentTier = threadRow(container, PARENT_THREAD_ID).closest(
      '[data-sidebar-sticky-tier="parent"]',
    );

    expect(parentTier).not.toBeNull();
    expect(parentTier?.closest("[data-sidebar-pinned-tree]")).toBeNull();
  });
});
