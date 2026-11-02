// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ExperimentalResolvedSidebarThreadGroup,
  ExperimentalResolvedSidebarThreadRowDecoration,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type { InboxGroupNode, InboxThreadNode } from "../model/layout.js";
import { testThread } from "../model/test-thread.js";
import type { InboxRowContext } from "./InboxRow.js";

installTestPluginRuntime();
const { InboxGroup } = await import("./InboxGroup.js");
const { InboxThreadRow } = await import("./InboxRow.js");

afterEach(cleanup);

const context: InboxRowContext = {
  onNavigate: () => undefined,
  projectName: () => "App",
  projectIconUrl: () => null,
  provider: () => null,
};

const TICKET_URL = "https://jira.example/browse/CORE-6";

function threadNode(thread: PluginSidebarThread): InboxThreadNode {
  return {
    kind: "thread",
    entry: {
      thread,
      status: "done",
      section: "inbox",
      returnAt: 1_000,
      workingSince: null,
      parked: null,
    },
    children: [],
    detachedFrom: null,
  };
}

function ticketGroup(
  overrides: Partial<ExperimentalResolvedSidebarThreadGroup> = {},
): ExperimentalResolvedSidebarThreadGroup {
  return {
    id: "pr-review/tickets/CORE-6",
    pluginId: "pr-review",
    projectId: "proj_a",
    key: "CORE-6",
    label: "Batch the importer",
    keyLabel: "CORE-6",
    labelHref: TICKET_URL,
    threadIds: ["thr_review"],
    rows: [],
    keepOrder: false,
    style: "flat",
    ...overrides,
  };
}

function rowDecoration(
  overrides: Partial<ExperimentalResolvedSidebarThreadRowDecoration>,
): ExperimentalResolvedSidebarThreadRowDecoration {
  return {
    icon: null,
    label: null,
    labelHref: null,
    description: null,
    trailing: null,
    pullRequest: null,
    ...overrides,
  };
}

function renderGroup(
  group: ExperimentalResolvedSidebarThreadGroup,
  decorations: Record<string, ExperimentalResolvedSidebarThreadRowDecoration> = {},
) {
  const thread = testThread("thr_review");
  const node: InboxGroupNode = {
    kind: "group",
    group,
    rows: [threadNode(thread)],
    placeholders: [],
  };
  return renderSlot(
    { component: InboxGroup },
    { node, activeThreadId: null, context },
    {
      sidebarThreads: { threads: [thread], projects: [] },
      sidebarThreadRowDecorations: decorations,
    },
  );
}

function renderRow(decoration: ExperimentalResolvedSidebarThreadRowDecoration) {
  const thread = testThread("thr_review", {
    environment: {
      id: "env_a",
      name: null,
      branchName: "ben/importer",
      path: null,
      isWorktree: null,
      providerId: null,
      workspaceDisplayKind: "other",
    },
  });
  let navigated = 0;
  const slot = renderSlot(
    { component: InboxThreadRow },
    {
      node: threadNode(thread),
      depth: 0,
      activeThreadId: null,
      context: { ...context, onNavigate: () => (navigated += 1) },
    },
    {
      sidebarThreads: { threads: [thread], projects: [] },
      sidebarThreadRowDecorations: { [thread.id]: decoration },
    },
  );
  return { slot, navigated: () => navigated };
}

describe("Inbox ticket links", () => {
  it("opens a group header's ticket key through the app without collapsing the group", () => {
    const slot = renderGroup(ticketGroup());
    const key = screen.getByRole("link", { name: "CORE-6" });
    expect(key.getAttribute("href")).toBe(TICKET_URL);
    expect(fireEvent.click(key)).toBe(false);
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "openUrl", url: TICKET_URL },
    ]);
    const toggle = screen.getByRole("button", { name: "Batch the importer" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("draws a group key without a labelHref as plain text", () => {
    renderGroup(ticketGroup({ labelHref: undefined }));
    expect(screen.queryByRole("link", { name: "CORE-6" })).toBeNull();
    expect(screen.getByText("CORE-6")).not.toBeNull();
  });

  it("does not repeat the group's key on its rows", () => {
    renderGroup(ticketGroup(), {
      thr_review: rowDecoration({ label: "CORE-6", labelHref: TICKET_URL }),
    });
    expect(screen.getAllByRole("link", { name: "CORE-6" })).toHaveLength(1);
  });

  it("opens a row's ticket label through the app without opening the thread", () => {
    const { slot, navigated } = renderRow(
      rowDecoration({ label: "CORE-7", labelHref: "https://jira.example/browse/CORE-7" }),
    );
    const label = screen.getByRole("link", { name: "CORE-7" });
    expect(label.hasAttribute("data-inbox-row-ticket-link")).toBe(true);
    expect(fireEvent.click(label)).toBe(false);
    expect(slot.inspection.navigateCalls).toEqual([
      { method: "openUrl", url: "https://jira.example/browse/CORE-7" },
    ]);
    expect(navigated()).toBe(0);
    expect(screen.getByText("ben/importer")).not.toBeNull();
  });

  it("draws a row label without a labelHref as plain text", () => {
    renderRow(rowDecoration({ label: "CORE-7" }));
    expect(screen.queryByRole("link", { name: "CORE-7" })).toBeNull();
    expect(screen.getByText("CORE-7")).not.toBeNull();
  });
});
