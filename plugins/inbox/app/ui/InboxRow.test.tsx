// @vitest-environment jsdom

import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ExperimentalResolvedSidebarProjectDecoration,
  ExperimentalResolvedSidebarThreadDecoration,
  ExperimentalResolvedSidebarThreadRowDecoration,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import type { InboxThreadNode } from "../model/layout.js";
import { testThread } from "../model/test-thread.js";
import type { InboxRowContext } from "./InboxRow.js";

installTestPluginRuntime();
const { InboxThreadRow } = await import("./InboxRow.js");

afterEach(cleanup);

const context: InboxRowContext = {
  onNavigate: () => undefined,
  projectName: () => "atlas",
  projectIconUrl: () => null,
  provider: () => null,
};

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

function renderRow({
  project,
  projectRow,
  row,
}: {
  project?: ExperimentalResolvedSidebarProjectDecoration;
  projectRow?: ExperimentalResolvedSidebarThreadDecoration;
  row?: ExperimentalResolvedSidebarThreadRowDecoration;
} = {}) {
  const thread: PluginSidebarThread = testThread("thr_row", {
    environment: {
      id: "env_a",
      name: null,
      branchName: "bi/retry-backoff",
      path: null,
      isWorktree: null,
      providerId: null,
      workspaceDisplayKind: "other",
    },
  });
  const node: InboxThreadNode = {
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
  return renderSlot(
    { component: InboxThreadRow },
    { node, depth: 0, activeThreadId: null, context },
    {
      sidebarThreads: { threads: [thread], projects: [] },
      sidebarProjectDecorations:
        project === undefined ? {} : { [thread.projectId]: project },
      sidebarThreadDecorations:
        projectRow === undefined ? {} : { [thread.projectId]: projectRow },
      sidebarThreadRowDecorations:
        row === undefined ? {} : { [thread.id]: row },
    },
  );
}

function projectName(): HTMLElement {
  const name = document.querySelector<HTMLElement>("[data-inbox-row-project-name]");
  if (name === null) throw new Error("project name not rendered");
  return name;
}

describe("Inbox row project decoration", () => {
  it("draws the name monogram and an untinted label without a decoration", () => {
    renderRow();
    expect(document.querySelector("[data-inbox-project-monogram]")).not.toBeNull();
    expect(document.querySelector("[data-inbox-row-project-leading]")).toBeNull();
    expect(document.querySelector("[data-inbox-row-project-edge]")).toBeNull();
    expect(projectName().style.color).toBe("");
  });

  it("replaces the monogram with the plugin's leading node", () => {
    renderRow({
      project: {
        leading: <button type="button">🚀</button>,
        accentColor: null,
        labelClassName: null,
        tint: false,
      },
    });
    expect(screen.getByRole("button", { name: "🚀" })).not.toBeNull();
    expect(document.querySelector("[data-inbox-project-monogram]")).toBeNull();
  });

  it("falls back to the per-project leading text when no node is supplied", () => {
    renderRow({ projectRow: { leading: "🛰", title: null, hue: null } });
    const leading = document.querySelector("[data-inbox-row-project-leading]");
    expect(leading?.textContent).toBe("🛰");
    expect(document.querySelector("[data-inbox-project-monogram]")).toBeNull();
  });

  it("draws the project hue as a row edge and a tinted, renamed label", () => {
    renderRow({ projectRow: { leading: null, title: "Atlas Core", hue: 255 } });
    const edge = document.querySelector<HTMLElement>("[data-inbox-row-project-edge]");
    expect(edge?.style.background).toContain("255");
    expect(projectName().textContent).toBe("Atlas Core");
    expect(projectName().style.color).toContain("255");
  });

  it("tints the label with the header accent color when no hue is supplied", () => {
    renderRow({
      project: {
        leading: null,
        accentColor: "rgb(10, 20, 30)",
        labelClassName: null,
        tint: true,
      },
    });
    expect(projectName().style.color).toBe("rgb(10, 20, 30)");
    expect(document.querySelector("[data-inbox-row-project-edge]")).toBeNull();
  });
});

describe("Inbox row thread decoration", () => {
  it("draws the pull request number in its state's color with the plugin icon", () => {
    renderRow({
      row: rowDecoration({
        pullRequest: { number: 552, state: "merged" },
        icon: { name: "GitPullRequestArrow", tone: "success" },
      }),
    });
    const badge = document.querySelector<HTMLElement>("[data-inbox-row-pull-request]");
    expect(badge?.textContent).toBe("#552");
    expect(badge?.dataset.inboxRowPullRequestState).toBe("merged");
    expect(badge?.querySelector("[data-icon]")?.getAttribute("data-icon")).toBe(
      "GitMerge",
    );
    expect(badge?.style.color).toContain("300");
    const icon = document.querySelector("[data-inbox-row-icon]");
    expect(icon?.getAttribute("data-inbox-row-icon")).toBe("GitPullRequestArrow");
  });

  it("colors a closed pull request as danger and draws no icon without one", () => {
    renderRow({ row: rowDecoration({ pullRequest: { number: 7, state: "closed" } }) });
    const badge = document.querySelector<HTMLElement>("[data-inbox-row-pull-request]");
    expect(badge?.textContent).toBe("#7");
    expect(badge?.style.color).toBe("var(--destructive-text)");
    expect(document.querySelector("[data-inbox-row-icon]")).toBeNull();
  });

  it("shows the description in place of the branch and keeps the branch as its tooltip", () => {
    renderRow({ row: rowDecoration({ description: "stacked on #551" }) });
    const description = screen.getByText("stacked on #551");
    expect(description.getAttribute("title")).toBe("bi/retry-backoff");
    expect(screen.queryByText("bi/retry-backoff")).toBeNull();
  });

  it("shows the branch when the decoration has no description", () => {
    renderRow({ row: rowDecoration({ trailing: { kind: "text", text: "2 checks" } }) });
    expect(screen.getByText("bi/retry-backoff")).not.toBeNull();
    expect(screen.getByText("2 checks")).not.toBeNull();
    expect(document.querySelector("[data-inbox-row-pull-request]")).toBeNull();
  });
});
