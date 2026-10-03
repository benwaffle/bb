// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import {
  getDockedThreadPanelsAtom,
  type DockedThreadPanel,
} from "@/components/secondary-panel/dockedThreadPanels";
import { DockedThreadPanelColumns } from "./DockedThreadPanelColumns";

const THREAD_ID = "thr_docked";
const PR_PANEL: DockedThreadPanel = {
  pluginId: "github",
  actionId: "pull",
  title: "GitHub PR",
  paramsJson: null,
};
const QUEUE_PANEL: DockedThreadPanel = {
  pluginId: "pr-review",
  actionId: "queue",
  title: "Review queue",
  paramsJson: null,
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderColumns({
  panels,
  compact = false,
  onUndock = vi.fn(),
}: {
  panels: readonly DockedThreadPanel[];
  compact?: boolean;
  onUndock?: (panel: DockedThreadPanel) => void;
}) {
  const store = createStore();
  store.set(getDockedThreadPanelsAtom(THREAD_ID), panels);
  const wrap = (children: ReactNode) => (
    <Provider store={store}>
      <CompactViewportOverrideProvider isCompactViewport={compact}>
        <TooltipProvider>{children}</TooltipProvider>
      </CompactViewportOverrideProvider>
    </Provider>
  );
  render(
    wrap(
      <DockedThreadPanelColumns
        threadId={THREAD_ID}
        className="flex flex-col"
        renderContent={(tab) => <div>content:{tab.actionId}</div>}
        onUndock={onUndock}
      >
        <div>thread timeline</div>
      </DockedThreadPanelColumns>,
    ),
  );
  return { store, onUndock };
}

describe("DockedThreadPanelColumns", () => {
  it("renders docked tabs left to right before the thread", () => {
    renderColumns({ panels: [QUEUE_PANEL, PR_PANEL] });

    const columns = screen.getAllByRole("region");
    expect(columns.map((column) => column.getAttribute("aria-label"))).toEqual([
      "Review queue",
      "GitHub PR",
    ]);
    expect(screen.getByText("content:queue")).toBeTruthy();
    expect(screen.getByText("content:pull")).toBeTruthy();
    const thread = screen.getByText("thread timeline");
    expect(
      columns[1]!.compareDocumentPosition(thread) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("moves a column back to the right panel", () => {
    const { store, onUndock } = renderColumns({
      panels: [QUEUE_PANEL, PR_PANEL],
    });

    fireEvent.click(
      screen.getAllByRole("button", { name: "Move to right panel" })[1]!,
    );

    expect(onUndock).toHaveBeenCalledWith(PR_PANEL);
    expect(store.get(getDockedThreadPanelsAtom(THREAD_ID))).toEqual([
      QUEUE_PANEL,
    ]);
    expect(screen.queryByText("content:pull")).toBeNull();
  });

  it("closes a column without reopening it", () => {
    const { store, onUndock } = renderColumns({ panels: [PR_PANEL] });

    fireEvent.click(screen.getByRole("button", { name: "Close docked panel" }));

    expect(onUndock).not.toHaveBeenCalled();
    expect(store.get(getDockedThreadPanelsAtom(THREAD_ID))).toEqual([]);
    expect(screen.queryByTestId("docked-thread-panels")).toBeNull();
    expect(screen.getByText("thread timeline")).toBeTruthy();
  });

  it("shows only the thread on compact viewports", () => {
    renderColumns({ panels: [PR_PANEL], compact: true });

    expect(screen.queryByText("content:pull")).toBeNull();
    expect(screen.getByText("thread timeline")).toBeTruthy();
  });
});
