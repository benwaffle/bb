// @vitest-environment jsdom

import { cleanup, fireEvent, screen } from "@testing-library/react";
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
  rowContext = context,
}: {
  project?: ExperimentalResolvedSidebarProjectDecoration;
  projectRow?: ExperimentalResolvedSidebarThreadDecoration;
  row?: ExperimentalResolvedSidebarThreadRowDecoration;
  rowContext?: InboxRowContext;
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
    { node, depth: 0, activeThreadId: null, context: rowContext },
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

const emojiProject: ExperimentalResolvedSidebarProjectDecoration = {
  leading: <button type="button">🚀</button>,
  accentColor: "rgb(10, 20, 30)",
  labelClassName: null,
  tint: true,
};

const withFavicon: InboxRowContext = {
  ...context,
  projectIconUrl: () => "https://github.com/atlas.png",
};

function favicon(): HTMLImageElement | null {
  return document.querySelector<HTMLImageElement>(
    'img[src="https://github.com/atlas.png"]',
  );
}

describe("Inbox row project decoration", () => {
  it("draws the name monogram and an untinted label without a decoration", () => {
    renderRow();
    expect(document.querySelector("[data-inbox-project-monogram]")).not.toBeNull();
    expect(document.querySelector("[data-inbox-row-project-leading]")).toBeNull();
    expect(projectName().style.color).toBe("");
  });

  it("keeps the project favicon over the plugin's emoji", () => {
    renderRow({
      project: emojiProject,
      projectRow: { leading: "🛰", title: null, hue: null },
      rowContext: withFavicon,
    });
    expect(favicon()).not.toBeNull();
    expect(screen.queryByRole("button", { name: "🚀" })).toBeNull();
    expect(document.querySelector("[data-inbox-row-project-leading]")).toBeNull();
  });

  it("shows the plugin's leading node when the project has no favicon", () => {
    renderRow({ project: emojiProject });
    expect(screen.getByRole("button", { name: "🚀" })).not.toBeNull();
    expect(document.querySelector("[data-inbox-project-monogram]")).toBeNull();
  });

  it("falls back to the per-project leading text when no node is supplied", () => {
    renderRow({ projectRow: { leading: "🛰", title: null, hue: null } });
    const leading = document.querySelector("[data-inbox-row-project-leading]");
    expect(leading?.textContent).toBe("🛰");
    expect(document.querySelector("[data-inbox-project-monogram]")).toBeNull();
  });

  it("draws no hue edge or tint from the plugin's hue and accent color", () => {
    renderRow({
      project: emojiProject,
      projectRow: { leading: null, title: "Atlas Core", hue: 255 },
      rowContext: withFavicon,
    });
    expect(document.querySelector("[data-inbox-row-project-edge]")).toBeNull();
    expect(projectName().style.color).toBe("");
    expect(projectName().textContent).toBe("atlas");
  });

  it("uses the plugin's title only when the project has no name", () => {
    renderRow({
      projectRow: { leading: null, title: "Atlas Core", hue: 255 },
      rowContext: { ...context, projectName: () => null },
    });
    expect(projectName().textContent).toBe("Atlas Core");
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

function threadNode(
  thread: PluginSidebarThread,
  children: InboxThreadNode[] = [],
): InboxThreadNode {
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
    children,
    detachedFrom: null,
  };
}

function renderNode(node: InboxThreadNode, rowContext: InboxRowContext) {
  const threads: PluginSidebarThread[] = [];
  const visit = (current: InboxThreadNode) => {
    threads.push(current.entry.thread);
    current.children.forEach(visit);
  };
  visit(node);
  return renderSlot(
    { component: InboxThreadRow },
    { node, depth: 0, activeThreadId: null, context: rowContext },
    { sidebarThreads: { threads, projects: [] } },
  );
}

function rowPart(threadId: string, selector: string): HTMLElement {
  const part = document.querySelector<HTMLElement>(
    `[data-inbox-thread-id="${threadId}"] ${selector}`,
  );
  if (part === null) throw new Error(`${selector} not rendered for ${threadId}`);
  return part;
}

describe("Inbox row navigation", () => {
  it("opens a child thread when its row is clicked away from the link", () => {
    const followed: (string | null)[] = [];
    const follow = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null;
      if (link === null) return;
      followed.push(link.getAttribute("href"));
      event.preventDefault();
    };
    document.addEventListener("click", follow);
    try {
      const navigations: string[] = [];
      const child = testThread("thr_child", { parentThreadId: "thr_parent" });
      renderNode(threadNode(testThread("thr_parent"), [threadNode(child)]), {
        ...context,
        onNavigate: () => navigations.push("navigate"),
      });

      fireEvent.click(screen.getByRole("button", { name: "Show 1 child thread" }));
      expect(followed).toEqual([]);

      fireEvent.click(rowPart("thr_child", "[data-inbox-row-project-name]"));
      expect(followed).toEqual(["/projects/proj_a/threads/thr_child"]);
      expect(navigations).toEqual(["navigate"]);

      fireEvent.click(screen.getByRole("link", { name: "thr_child" }));
      expect(followed).toEqual([
        "/projects/proj_a/threads/thr_child",
        "/projects/proj_a/threads/thr_child",
      ]);
    } finally {
      document.removeEventListener("click", follow);
    }
  });

  it("offers no Settle on a pinned row", () => {
    renderNode(threadNode(testThread("thr_pinned", { isPinned: true, pinnedAt: 1 })), context);
    expect(screen.queryByRole("button", { name: "Settle" })).toBeNull();
    expect(screen.getByRole("button", { name: "Snooze" })).not.toBeNull();
  });
});
