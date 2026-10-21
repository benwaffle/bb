// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PluginThreadListProps } from "@get-bb/plugin-sdk/app";
import {
  loadPluginApp,
  renderSlot,
  type RenderSlotOptions,
} from "@get-bb/plugin-sdk/testing/app";
import {
  makePluginProject,
  makeSidebarPullRequest,
  makeSidebarThread,
} from "./app/model/fixtures.js";
import {
  resetPreferencesSyncForTest,
  setPreferencesMirrorStorageForTest,
} from "./app/preferences/preferences-sync.js";
import {
  defaultPreferences,
  type PreferenceValues,
} from "./shared/preferences.js";

const app = await loadPluginApp(() => import("./app"));
const registration = app.threadLists[0];
if (!registration) throw new Error("thread-list slot not registered");

const PERSONAL_PROJECT_ID = "proj_personal";

const PROJECTS = [
  makePluginProject({
    id: PERSONAL_PROJECT_ID,
    name: "Personal",
    isPersonal: true,
  }),
  makePluginProject({ id: "proj_app", name: "App" }),
  makePluginProject({ id: "proj_web", name: "Web" }),
];

const SECTIONS = [
  { id: "sec_later", name: "Later", createdAt: 1, updatedAt: 1 },
  { id: "sec_review", name: "Review", createdAt: 2, updatedAt: 2 },
];

const THREADS = [
  makeSidebarThread({
    id: "thr_pinned",
    projectId: "proj_app",
    title: "Pinned thread",
    isPinned: true,
    pinnedAt: 10,
    pinSortKey: "a",
    createdAt: 10,
    updatedAt: 10,
    latestAttentionAt: 10,
  }),
  makeSidebarThread({
    id: "thr_parent",
    projectId: "proj_app",
    title: "Parent thread",
    createdAt: 8,
    updatedAt: 8,
    latestAttentionAt: 8,
  }),
  makeSidebarThread({
    id: "thr_child",
    projectId: "proj_app",
    title: "Child thread",
    parentThreadId: "thr_parent",
    createdAt: 7,
    updatedAt: 7,
    latestAttentionAt: 7,
  }),
  makeSidebarThread({
    id: "thr_later",
    projectId: "proj_web",
    title: "Later thread",
    sectionId: "sec_later",
    createdAt: 6,
    updatedAt: 6,
    latestAttentionAt: 6,
    host: { id: "host_laptop", name: "Laptop" },
    environment: {
      id: "env_web",
      name: null,
      branchName: "main",
      path: null,
      providerId: null,
      isWorktree: false,
      workspaceDisplayKind: "other",
    },
  }),
  makeSidebarThread({
    id: "thr_personal",
    projectId: PERSONAL_PROJECT_ID,
    title: "Personal thread",
    createdAt: 5,
    updatedAt: 5,
    latestAttentionAt: 5,
  }),
];

function props(): PluginThreadListProps {
  return {
    activeThreadId: null,
    activeProjectId: null,
    isCompactViewport: false,
    onNavigate: vi.fn(),
    searchQuery: "",
  };
}

function renderList(
  preferences: Partial<PreferenceValues>,
  options: RenderSlotOptions = {},
) {
  return renderSlot(registration, props(), {
    sidebarThreads: {
      projects: PROJECTS,
      sections: SECTIONS,
      threads: THREADS,
    },
    rpc: {
      listPreferences: () => ({
        preferences: { ...defaultPreferences(), ...preferences },
      }),
      setPreference: (input: unknown) => input,
    },
    ...options,
  });
}

function sectionHeaders(): string[] {
  return Array.from(
    document.querySelectorAll('[data-sidebar-sticky-tier="label"] [title]'),
    (element) => element.getAttribute("title") ?? "",
  );
}

function threadIds(): string[] {
  return Array.from(
    document.querySelectorAll("[data-sidebar-thread-id]"),
    (element) => element.getAttribute("data-sidebar-thread-id") ?? "",
  );
}

afterEach(() => {
  cleanup();
  resetPreferencesSyncForTest();
  setPreferencesMirrorStorageForTest(undefined);
});

describe("thread-list plugin", () => {
  it("shows the navigation skeleton until preferences load", () => {
    setPreferencesMirrorStorageForTest(null);
    renderSlot(registration, props(), {
      sidebarThreads: {
        projects: PROJECTS,
        sections: SECTIONS,
        threads: THREADS,
      },
      rpc: { listPreferences: () => new Promise(() => undefined) },
    });
    expect(screen.getByLabelText("Loading sidebar navigation")).not.toBeNull();
    expect(threadIds()).toEqual([]);
  });

  it("renders pinned, custom sections, and loose threads in chronological mode", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { rpcCalls } = renderList({ organizationMode: "chronological" });

    await screen.findByText("Pinned thread");
    expect(rpcCalls.map((call) => call.method)).toEqual(["listPreferences"]);
    expect(sectionHeaders()).toEqual(["Pinned", "Later", "Review", "Threads"]);
    expect(threadIds()).toEqual([
      "thr_pinned",
      "thr_later",
      "thr_parent",
      "thr_child",
      "thr_personal",
    ]);
    expect(
      screen.getByRole("button", { name: "Collapse Parent thread threads" }),
    ).not.toBeNull();
  });

  it("shows a plugin's project decoration on thread rows only outside their project header", async () => {
    setPreferencesMirrorStorageForTest(null);
    const sidebarThreadDecorations = {
      proj_app: { leading: "🚀", title: "App", hue: 230 },
      proj_web: { leading: "🌐", title: null, hue: null },
    };
    const threadRow = (threadId: string) =>
      document
        .querySelector(`[data-sidebar-thread-id="${threadId}"]`)
        ?.closest("[data-sidebar-rename-row]") ?? null;
    const hueEdge = (threadId: string) =>
      threadRow(threadId)
        ?.querySelector("[data-sidebar-project-hue-edge]")
        ?.getAttribute("data-sidebar-project-hue-edge") ?? null;
    const secondLine = (threadId: string) =>
      threadRow(threadId)?.querySelector("[data-sidebar-thread-second-line]")
        ?.textContent ?? null;

    renderList(
      { organizationMode: "chronological" },
      { sidebarThreadDecorations },
    );
    await screen.findByText("Parent thread");
    expect(secondLine("thr_parent")).toBe("App");
    expect(secondLine("thr_child")).toBeNull();
    expect(secondLine("thr_later")).toBe("Web·main");
    expect(secondLine("thr_personal")).toBe("Personal");
    expect(hueEdge("thr_parent")).toBe("230");
    expect(hueEdge("thr_later")).toBeNull();
    expect(document.body.textContent).not.toContain("🚀");
    cleanup();

    renderList(
      { organizationMode: "chronological", twoLineRows: false },
      { sidebarThreadDecorations },
    );
    await screen.findByText("Parent thread");
    expect(secondLine("thr_later")).toBeNull();
    expect(hueEdge("thr_parent")).toBe("230");
    expect(document.body.textContent).not.toContain("🚀");
    cleanup();

    renderList({ organizationMode: "project" }, { sidebarThreadDecorations });
    await screen.findByText("Parent thread");
    expect(secondLine("thr_pinned")).toBe("App");
    expect(secondLine("thr_parent")).toBeNull();
    expect(hueEdge("thr_parent")).toBeNull();
    expect(hueEdge("thr_pinned")).toBeNull();
    expect(secondLine("thr_later")).toBe("main");
  });

  it("labels flat sections by day and turns the labels off with the preference", async () => {
    setPreferencesMirrorStorageForTest(null);
    const dayLabels = () =>
      Array.from(
        document.querySelectorAll("[data-sidebar-day-label]"),
        (label) => label.textContent,
      );

    renderList({ organizationMode: "chronological" });
    await screen.findByText("Parent thread");
    expect(dayLabels()).toEqual(["Earlier", "Earlier"]);
    cleanup();

    renderList({ organizationMode: "chronological", dayLabels: false });
    await screen.findByText("Parent thread");
    expect(dayLabels()).toEqual([]);
    cleanup();

    renderList({
      organizationMode: "chronological",
      chronologicalSort: "alpha",
    });
    await screen.findByText("Parent thread");
    expect(dayLabels()).toEqual([]);
    cleanup();

    renderList({ organizationMode: "project" });
    await screen.findByText("Parent thread");
    expect(dayLabels()).toEqual([]);
  });

  it("decorates flat thread rows from a plugin's per-thread hook", async () => {
    setPreferencesMirrorStorageForTest(null);
    const threadRow = (threadId: string) =>
      document
        .querySelector(`[data-sidebar-thread-id="${threadId}"]`)
        ?.closest("[data-sidebar-rename-row]") ?? null;
    const sidebarThreadRowDecorations = {
      thr_later: {
        icon: { name: "GitPullRequest", tone: "success" },
        label: "CORE-123",
        description: null,
        trailing: { kind: "text", text: "2/3" },
      },
    } as const;

    renderList(
      { organizationMode: "chronological" },
      {
        sidebarThreadRowDecorations,
        sidebarPullRequests: {
          thr_later: makeSidebarPullRequest({ number: 42, state: "merged" }),
        },
      },
    );
    await screen.findByText("Later thread");
    const later = threadRow("thr_later") as HTMLElement;
    expect(
      later.querySelector("[data-sidebar-thread-second-line]")?.textContent,
    ).toBe("Web·CORE-123·#42");
    expect(
      later
        .querySelector("[data-sidebar-thread-second-line-pull-request]")
        ?.getAttribute("data-sidebar-thread-second-line-pull-request"),
    ).toBe("merged");
    expect(
      later.querySelector('[data-sidebar-plugin-row-icon="success"]'),
    ).not.toBeNull();
    expect(later.querySelector("[data-sidebar-thread-provider]")).toBeNull();
    expect(
      later.querySelector('[data-sidebar-plugin-row-trailing="text"]')
        ?.textContent,
    ).toBe("2/3");
    cleanup();

    renderList(
      { organizationMode: "project" },
      { sidebarThreadRowDecorations },
    );
    await screen.findByText("Later thread");
    const nested = threadRow("thr_later") as HTMLElement;
    expect(
      nested.querySelector("[data-sidebar-thread-second-line]")?.textContent,
    ).toBe("main");
    expect(nested.querySelector("[data-sidebar-plugin-row-icon]")).toBeNull();
  });

  it("groups pinned worktree roots when environment grouping is enabled", async () => {
    setPreferencesMirrorStorageForTest(null);
    const environment = {
      id: "env_review",
      name: "Reviewer worktree group",
      branchName: "review",
      path: null,
      providerId: null,
      isWorktree: true,
      workspaceDisplayKind: "managed-worktree" as const,
    };
    const pinnedWorktreeThreads = [
      makeSidebarThread({
        id: "thr_worktree_a",
        projectId: "proj_app",
        title: "Worktree root A",
        pinnedAt: 20,
        pinSortKey: "a",
        environment,
      }),
      makeSidebarThread({
        id: "thr_worktree_b",
        projectId: "proj_app",
        title: "Worktree root B",
        pinnedAt: 19,
        pinSortKey: "b",
        environment,
      }),
    ];
    renderList(
      {
        organizationMode: "chronological",
        environmentGrouping: true,
      },
      {
        sidebarThreads: {
          projects: PROJECTS,
          sections: SECTIONS,
          threads: [...THREADS, ...pinnedWorktreeThreads],
        },
      },
    );

    const environmentGroup = (
      await screen.findByText("Reviewer worktree group")
    ).closest("[data-sidebar-sticky-group]");
    expect(environmentGroup).not.toBeNull();
    expect(
      within(environmentGroup as HTMLElement).getByText("Worktree root A"),
    ).not.toBeNull();
    expect(
      within(environmentGroup as HTMLElement).getByText("Worktree root B"),
    ).not.toBeNull();
  });

  it("groups threads by machine in machine mode", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ organizationMode: "machine" });

    await screen.findByText("Pinned thread");
    expect(sectionHeaders()).toEqual(["Pinned", "Laptop", "No machine"]);
    const laptop = screen
      .getByTitle("Laptop")
      .closest("[data-sidebar-sticky-group]");
    expect(laptop).not.toBeNull();
    expect(
      within(laptop as HTMLElement).getByText("Later thread"),
    ).not.toBeNull();
    const noMachine = screen
      .getByTitle("No machine")
      .closest("[data-sidebar-sticky-group]");
    expect(
      within(noMachine as HTMLElement).getByText("Personal thread"),
    ).not.toBeNull();
  });

  it("opens the composer on the machine named by its section", async () => {
    setPreferencesMirrorStorageForTest(null);
    const { inspection } = renderList({ organizationMode: "machine" });

    fireEvent.click(
      await screen.findByRole("button", { name: "New thread in Laptop" }),
    );

    expect(inspection.navigateCalls).toContainEqual({
      method: "toCompose",
      options: {
        projectId: PERSONAL_PROJECT_ID,
        hostId: "host_laptop",
        placement: { sectionId: null, pinned: false },
        focusPrompt: true,
      },
    });
  });

  it("shows a machine section before it has any threads", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList(
      { organizationMode: "machine" },
      {
        sidebarThreads: {
          projects: PROJECTS,
          sections: SECTIONS,
          threads: THREADS,
          experimental_hosts: [
            { id: "host_laptop", name: "Laptop" },
            { id: "host_empty", name: "Studio Mac" },
          ],
        },
      },
    );

    await screen.findByText("Pinned thread");
    expect(sectionHeaders()).toEqual([
      "Pinned",
      "Laptop",
      "Studio Mac",
      "No machine",
    ]);
  });

  it("groups threads by project in project mode", async () => {
    setPreferencesMirrorStorageForTest(null);
    renderList({ organizationMode: "project" });

    await screen.findByText("Pinned thread");
    expect(sectionHeaders()).toEqual(["Pinned", "App", "Web", "Threads"]);
    const appGroup = screen
      .getByTitle("App")
      .closest("[data-sidebar-sticky-group]") as HTMLElement;
    expect(within(appGroup).getByText("Parent thread")).not.toBeNull();
    expect(within(appGroup).getByText("Child thread")).not.toBeNull();
    const webGroup = screen
      .getByTitle("Web")
      .closest("[data-sidebar-sticky-group]") as HTMLElement;
    expect(within(webGroup).getByText("Later thread")).not.toBeNull();
    const threadsGroup = screen
      .getByTitle("Threads")
      .closest("[data-sidebar-sticky-group]") as HTMLElement;
    expect(within(threadsGroup).getByText("Personal thread")).not.toBeNull();
  });

  it("decorates a project header with a plugin's leading node, accent color, and tint", async () => {
    setPreferencesMirrorStorageForTest(null);
    const onEmojiClick = vi.fn();
    renderList(
      { organizationMode: "project" },
      {
        sidebarProjectDecorations: {
          proj_app: {
            leading: (
              <button type="button" onClick={onEmojiClick}>
                🚀
              </button>
            ),
            accentColor: "rgb(120, 160, 255)",
            labelClassName: "tracking-tight",
            tint: true,
          },
        },
      },
    );

    const name = await screen.findByTitle("App");
    const header = name.closest("[data-sidebar-sticky-tier]") as HTMLElement;
    expect(name.style.color).toBe("rgb(120, 160, 255)");
    expect(name.className).toContain("font-bold");
    expect(name.className).toContain("tracking-tight");
    expect(header.classList).toContain("bb-sidebar-project-tint-row");
    expect(header.style.getPropertyValue("--bb-sidebar-project-tint")).toBe(
      "rgb(120, 160, 255)",
    );

    const leading = within(header).getByRole("button", { name: "🚀" });
    expect(
      leading.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(leading);
    expect(onEmojiClick).toHaveBeenCalledTimes(1);

    expect(header.classList).toContain("bb-sidebar-hover-actions-row");
    fireEvent.pointerDown(
      within(header).getByRole("button", { name: "App actions" }),
      { button: 0, ctrlKey: false },
    );
    await screen.findByRole("menu");
    expect(header.querySelector('[data-state="open"]')).not.toBeNull();
    expect(header.classList).toContain("bb-sidebar-project-tint-row");

    const webName = screen.getByTitle("Web");
    const webHeader = webName.closest(
      "[data-sidebar-sticky-tier]",
    ) as HTMLElement;
    expect(webName.getAttribute("style")).toBeNull();
    expect(webName.className).not.toContain("font-bold");
    expect(webHeader.classList).not.toContain("bb-sidebar-project-tint-row");
    expect(
      webHeader.querySelector("[data-sidebar-section-leading]"),
    ).toBeNull();
  });

  it("nests a project's threads and placeholder rows under plugin thread groups", async () => {
    setPreferencesMirrorStorageForTest(null);
    const onSelect = vi.fn();
    const run = vi.fn();
    const reviewThread = makeSidebarThread({
      id: "thr_review",
      projectId: "proj_app",
      title: "Review thread",
      createdAt: 9,
      updatedAt: 9,
      latestAttentionAt: 9,
    });
    renderList(
      { organizationMode: "project" },
      {
        sidebarThreads: {
          projects: PROJECTS,
          sections: SECTIONS,
          threads: [...THREADS, reviewThread],
        },
        sidebarThreadGroups: [
          {
            id: "pr-review/tickets:CORE-21",
            pluginId: "pr-review",
            projectId: "proj_app",
            key: "CORE-21",
            label: "CORE-21",
            tooltip: "Speed up the importer",
            threadIds: ["thr_review", "thr_parent"],
            keepOrder: false,
            style: "flat",
            rows: [
              {
                id: "hss#600",
                title: "#600 Batch the importer",
                description: "ana",
                icon: { name: "GitPullRequest", tone: "success" },
                trailing: { kind: "text", text: "idle" },
                onSelect,
                action: { label: "Start", run },
              },
            ],
          },
        ],
      },
    );

    const header = await screen.findByText("CORE-21");
    expect(header.parentElement?.getAttribute("title")).toBe(
      "Speed up the importer",
    );
    const appGroup = screen
      .getByTitle("App")
      .closest("[data-sidebar-sticky-group]") as HTMLElement;
    const ticketGroup = header.closest(
      "[data-sidebar-sticky-group]",
    ) as HTMLElement;
    expect(appGroup.contains(ticketGroup)).toBe(true);
    expect(
      Array.from(
        ticketGroup.querySelectorAll("[data-sidebar-thread-id]"),
        (element) => element.getAttribute("data-sidebar-thread-id"),
      ),
    ).toEqual(["thr_review", "thr_parent", "thr_child"]);
    const groupedThreadRow = ticketGroup
      .querySelector('[data-sidebar-thread-id="thr_review"]')
      ?.closest("[data-sidebar-rename-row]") as HTMLElement;
    const placeholderRow = ticketGroup.querySelector(
      '[data-sidebar-plugin-thread-group-row="hss#600"]',
    ) as HTMLElement;
    expect(placeholderRow.style.paddingLeft).toBe(
      groupedThreadRow.style.paddingLeft,
    );
    expect(
      Array.from(
        placeholderRow.querySelector(
          "[data-sidebar-plugin-thread-group-row-content]",
        )?.children ?? [],
        (child) => child.textContent,
      ),
    ).toEqual(["", "#600 Batch the importer", "ana", "idle"]);

    expect(
      placeholderRow
        .querySelector("[data-sidebar-plugin-row-icon]")
        ?.getAttribute("data-sidebar-plugin-row-icon"),
    ).toBe("success");
    expect(
      placeholderRow.querySelector('[data-sidebar-plugin-row-trailing="text"]')
        ?.textContent,
    ).toBe("idle");
    expect(
      ticketGroup.querySelector("[data-sidebar-plugin-thread-group-progress]")
        ?.textContent,
    ).toBe("2/3");
    expect(
      ticketGroup?.getAttribute("data-sidebar-plugin-thread-group-style"),
    ).toBe("flat");
    expect(
      ticketGroup.querySelector("[data-sidebar-plugin-thread-group-key]"),
    ).toBeNull();
    const startButton = within(ticketGroup).getByRole("button", {
      name: "Start",
    });
    expect(startButton.parentElement?.classList).toContain(
      "bb-sidebar-hover-actions",
    );

    fireEvent.click(screen.getByText("#600 Batch the importer"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(startButton);
    expect(run).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Collapse CORE-21" }));
    await waitFor(() =>
      expect(screen.queryByText("#600 Batch the importer")).toBeNull(),
    );
    expect(screen.queryByText("Review thread")).toBeNull();
  });

  it("draws a minimal group with a key pill, ghost rows, and a compact action", async () => {
    setPreferencesMirrorStorageForTest(null);
    const run = vi.fn();
    renderList(
      { organizationMode: "project" },
      {
        sidebarThreads: {
          projects: PROJECTS,
          sections: SECTIONS,
          threads: THREADS,
        },
        sidebarThreadGroups: [
          {
            id: "pr-review/tickets:CORE-21",
            pluginId: "pr-review",
            projectId: "proj_app",
            key: "CORE-21",
            keyLabel: "CORE-21",
            label: "Speed up the importer",
            icon: "GitPullRequestArrow",
            threadIds: ["thr_parent"],
            keepOrder: false,
            style: "minimal",
            rows: [
              {
                id: "pr-600",
                title: "#600 Batch the importer",
                variant: "ghost",
                onSelect: () => undefined,
                action: { label: "+", run },
              },
              {
                id: "pr-601",
                title: "#601 Retry the importer",
                onSelect: () => undefined,
                action: { label: "Start", run },
              },
            ],
          },
        ],
      },
    );

    const ticketGroup = (await screen.findByText("CORE-21")).closest(
      "[data-sidebar-sticky-group]",
    ) as HTMLElement;
    expect(
      ticketGroup.getAttribute("data-sidebar-plugin-thread-group-style"),
    ).toBe("minimal");
    expect(ticketGroup.classList).not.toContain("border");
    const header = ticketGroup.querySelector(
      "[data-sidebar-plugin-thread-group]",
    ) as HTMLElement;
    const pill = header.querySelector(
      "[data-sidebar-plugin-thread-group-key]",
    ) as HTMLElement;
    expect(pill.getAttribute("data-sidebar-plugin-thread-group-key")).toBe(
      "pill",
    );
    expect(pill.classList).toContain("bg-sidebar-accent");
    expect(pill.textContent).toBe("CORE-21");
    expect(header.firstElementChild?.firstElementChild).toBe(pill);
    expect(pill.nextElementSibling?.textContent).toBe("Speed up the importer");

    const ghostRow = ticketGroup.querySelector(
      '[data-sidebar-plugin-thread-group-row="pr-600"]',
    ) as HTMLElement;
    expect(
      ghostRow.getAttribute("data-sidebar-plugin-thread-group-row-variant"),
    ).toBe("ghost");
    const groupedThreadRow = ticketGroup
      .querySelector('[data-sidebar-thread-id="thr_parent"]')
      ?.closest("[data-sidebar-rename-row]") as HTMLElement;
    expect(ghostRow.style.paddingLeft).not.toBe("");
    expect(ghostRow.style.paddingLeft).toBe(groupedThreadRow.style.paddingLeft);
    const ghostContent = ghostRow.querySelector(
      "[data-sidebar-plugin-thread-group-row-content]",
    ) as HTMLElement;
    expect(ghostContent.getAttribute("style")).toBeNull();
    expect(
      Array.from(ghostContent.classList).filter((name) =>
        /^(p[lx]|m[lx]|border(-l)?|border-dashed)(-|$)/.test(name),
      ),
    ).toEqual([]);
    expect(ghostRow.querySelector(".border-dashed")).toBeNull();
    const compact = within(ghostRow).getByRole("button", { name: "+" });
    expect(
      compact.getAttribute("data-sidebar-plugin-thread-group-row-action"),
    ).toBe("compact");
    expect(compact.classList).toContain("rounded-full");
    expect(compact.parentElement?.classList).toContain(
      "bb-sidebar-hover-actions",
    );
    fireEvent.click(compact);
    expect(run).toHaveBeenCalledTimes(1);

    const plainRow = ticketGroup.querySelector(
      '[data-sidebar-plugin-thread-group-row="pr-601"]',
    ) as HTMLElement;
    expect(
      plainRow.hasAttribute("data-sidebar-plugin-thread-group-row-variant"),
    ).toBe(false);
    expect(plainRow.querySelector(".border-dashed")).toBeNull();
    expect(
      within(plainRow)
        .getByRole("button", { name: "Start" })
        .getAttribute("data-sidebar-plugin-thread-group-row-action"),
    ).toBe("label");
  });

  it("interleaves decorated thread rows with placeholder rows when a group keeps its order", async () => {
    setPreferencesMirrorStorageForTest(null);
    const reviewThread = makeSidebarThread({
      id: "thr_review",
      projectId: "proj_app",
      title: "Review thread",
      createdAt: 9,
      updatedAt: 9,
      latestAttentionAt: 9,
    });
    const placeholder = (id: string) => ({
      id,
      title: id,
      onSelect: () => undefined,
    });
    const archived: string[] = [];
    const { inspection } = renderList(
      { organizationMode: "project" },
      {
        sdk: { threads: { update: vi.fn().mockResolvedValue({}) } },
        threadActions: (thread) => [
          {
            key: "bb--core/archive",
            pluginId: "bb--core",
            group: "4_lifecycle",
            action: {
              label: "Archive",
              icon: "Archive",
              run: async () => {
                archived.push(thread.id);
              },
            },
          },
        ],
        sidebarThreads: {
          projects: PROJECTS,
          sections: SECTIONS,
          threads: [...THREADS, reviewThread],
        },
        sidebarThreadGroups: [
          {
            id: "pr-review/tickets:CORE-21",
            pluginId: "pr-review",
            projectId: "proj_app",
            key: "CORE-21",
            keyLabel: "CORE-21",
            label: "Speed up the importer",
            icon: "GitPullRequestArrow",
            threadIds: ["thr_parent", "thr_review"],
            rows: [
              placeholder("#552 Base"),
              {
                threadId: "thr_review",
                depth: 1,
                description: "stacked on #552",
                icon: { name: "GitMerge", tone: "accent" },
                trailing: { kind: "dot", tone: "accent" },
              },
              { ...placeholder("#560 Top"), depth: 2 },
            ],
            keepOrder: true,
            style: "card",
          },
        ],
      },
    );

    const ticketGroup = (await screen.findByText("CORE-21")).closest(
      "[data-sidebar-sticky-group]",
    ) as HTMLElement;
    expect(
      ticketGroup?.getAttribute("data-sidebar-plugin-thread-group-style"),
    ).toBe("card");
    expect(ticketGroup.classList).toContain("border-sidebar-border");
    const ticketHeader = ticketGroup.querySelector(
      "[data-sidebar-plugin-thread-group]",
    ) as HTMLElement;
    expect(ticketHeader.parentElement).toBe(ticketGroup);
    expect(
      ticketHeader.querySelector("[data-sidebar-plugin-thread-group-key]")
        ?.textContent,
    ).toBe("CORE-21");
    within(ticketHeader).getByText("Speed up the importer");
    expect(
      ticketHeader.querySelector("[data-sidebar-plugin-thread-group-progress]")
        ?.textContent,
    ).toBe("2/4");
    expect(
      Array.from(
        ticketGroup.querySelectorAll(
          "[data-sidebar-thread-id], [data-sidebar-plugin-thread-group-row]",
        ),
        (element) =>
          element.getAttribute("data-sidebar-thread-id") ??
          element.getAttribute("data-sidebar-plugin-thread-group-row"),
      ),
    ).toEqual([
      "thr_parent",
      "thr_child",
      "#552 Base",
      "thr_review",
      "#560 Top",
    ]);
    const reviewRow = ticketGroup
      .querySelector('[data-sidebar-thread-id="thr_review"]')
      ?.closest("[data-sidebar-rename-row]") as HTMLElement;
    const depthRail = reviewRow.querySelector("[data-sidebar-thread-depth]");
    expect(depthRail?.textContent).toBe("");
    expect(depthRail?.children).toHaveLength(1);
    expect(
      reviewRow
        .querySelector("[data-sidebar-plugin-row-icon]")
        ?.getAttribute("data-sidebar-plugin-row-icon"),
    ).toBe("accent");
    expect(
      reviewRow
        .querySelector("[data-sidebar-plugin-row-trailing]")
        ?.getAttribute("data-sidebar-plugin-row-trailing"),
    ).toBe("dot:accent");
    expect(
      reviewRow.querySelector("[data-sidebar-thread-description]")?.textContent,
    ).toBe("stacked on #552");
    const parentRow = ticketGroup
      .querySelector('[data-sidebar-thread-id="thr_parent"]')
      ?.closest("[data-sidebar-rename-row]") as HTMLElement;
    expect(parentRow.querySelector("[data-sidebar-thread-depth]")).toBeNull();
    const topRow = ticketGroup.querySelector(
      '[data-sidebar-plugin-thread-group-row="#560 Top"]',
    ) as HTMLElement;
    expect(
      topRow
        .querySelector("[data-sidebar-thread-depth]")
        ?.getAttribute("data-sidebar-thread-depth"),
    ).toBe("2");
    expect(
      ticketGroup
        .querySelector('[data-sidebar-plugin-thread-group-row="#552 Base"]')
        ?.querySelector("[data-sidebar-thread-depth]"),
    ).toBeNull();

    fireEvent.click(within(reviewRow).getByRole("button", { name: "Archive" }));
    fireEvent.doubleClick(within(reviewRow).getByText("Review thread"));
    const input = await screen.findByRole("textbox", { name: "Thread name" });
    expect(
      reviewRow.querySelector("[data-sidebar-thread-description]"),
    ).toBeNull();
    fireEvent.change(input, { target: { value: "Renamed review" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(inspection.sdkCalls).toEqual([
        {
          method: "threads.update",
          args: [{ threadId: "thr_review", title: "Renamed review" }],
        },
      ]),
    );
    expect(archived).toEqual(["thr_review"]);
  });

  it("renders plugin thread groups inside the flat Custom list", async () => {
    setPreferencesMirrorStorageForTest(null);
    const run = vi.fn();
    const groupId = "pr-review/tickets:CORE-21";
    const reviewThread = makeSidebarThread({
      id: "thr_review",
      projectId: "proj_app",
      title: "Review thread",
      createdAt: 4,
      updatedAt: 4,
      latestAttentionAt: 4,
    });
    const options: RenderSlotOptions = {
      sidebarThreads: {
        projects: PROJECTS,
        sections: SECTIONS,
        threads: [...THREADS, reviewThread],
      },
      sidebarThreadDecorations: {
        proj_app: { leading: "🚀", title: "App", hue: 230 },
      },
      sidebarThreadGroups: [
        {
          id: groupId,
          pluginId: "pr-review",
          projectId: "proj_app",
          key: "CORE-21",
          keyLabel: "CORE-21",
          label: "Speed up the importer",
          threadIds: ["thr_review", "thr_parent"],
          keepOrder: false,
          style: "minimal",
          rows: [
            {
              id: "pr-600",
              title: "#600 Batch the importer",
              variant: "ghost",
              onSelect: () => undefined,
              action: { label: "+", run },
            },
          ],
        },
      ],
    };
    const secondLine = (threadId: string) =>
      document
        .querySelector(`[data-sidebar-thread-id="${threadId}"]`)
        ?.closest("[data-sidebar-rename-row]")
        ?.querySelector("[data-sidebar-thread-second-line]")?.textContent ??
      null;

    renderList({ organizationMode: "chronological" }, options);
    const ticketGroup = (await screen.findByText("CORE-21")).closest(
      "[data-sidebar-sticky-group]",
    ) as HTMLElement;
    expect(threadIds()).toEqual([
      "thr_pinned",
      "thr_later",
      "thr_parent",
      "thr_child",
      "thr_review",
      "thr_personal",
    ]);
    expect(
      Array.from(
        ticketGroup.querySelectorAll("[data-sidebar-thread-id]"),
        (element) => element.getAttribute("data-sidebar-thread-id"),
      ),
    ).toEqual(["thr_parent", "thr_child", "thr_review"]);
    expect(
      ticketGroup
        .querySelector("[data-sidebar-plugin-thread-group]")
        ?.querySelector("[data-sidebar-plugin-thread-group-project]")
        ?.textContent,
    ).toBe("🚀App");
    const ticketEdges = ticketGroup.querySelectorAll(
      "[data-sidebar-project-hue-edge]",
    );
    expect(
      Array.from(ticketEdges, (edge) =>
        edge.getAttribute("data-sidebar-project-hue-edge"),
      ),
    ).toEqual(["230"]);
    expect(
      ticketGroup
        .querySelector("[data-sidebar-plugin-thread-group]")
        ?.contains(ticketEdges[0] ?? null),
    ).toBe(true);
    expect(
      ticketGroup.querySelector('[data-sidebar-thread-group-line="230"]'),
    ).not.toBeNull();
    expect(
      ticketGroup
        .querySelector('[data-sidebar-plugin-thread-group-key="pill"]')
        ?.getAttribute("style"),
    ).toContain("var(--project-hue-text-c) 230");
    expect(
      ticketGroup.querySelectorAll(
        "[data-sidebar-rename-row] > [data-sidebar-project-hue-edge]",
      ),
    ).toHaveLength(0);
    expect(secondLine("thr_review")).toBeNull();
    expect(secondLine("thr_personal")).toBe("Personal");
    fireEvent.click(
      within(
        ticketGroup.querySelector(
          '[data-sidebar-plugin-thread-group-row="pr-600"]',
        ) as HTMLElement,
      ).getByRole("button", { name: "+" }),
    );
    expect(run).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Collapse Speed up the importer" }),
    );
    await waitFor(() => expect(screen.queryByText("Review thread")).toBeNull());
    cleanup();

    renderList(
      { organizationMode: "project", collapsedEnvironments: [groupId] },
      options,
    );
    await waitFor(() =>
      expect(
        screen
          .getByTitle("App")
          .closest("[data-sidebar-sticky-group]")
          ?.querySelector(`[data-sidebar-plugin-thread-group="${groupId}"]`),
      ).not.toBeNull(),
    );
    expect(
      document.querySelector("[data-sidebar-plugin-thread-group-project]"),
    ).toBeNull();
    expect(screen.queryByText("Review thread")).toBeNull();
    cleanup();

    renderList(
      { organizationMode: "chronological", collapsedEnvironments: [groupId] },
      options,
    );
    await waitFor(() =>
      expect(
        document.querySelector("[data-sidebar-plugin-thread-group-project]"),
      ).not.toBeNull(),
    );
    expect(screen.queryByText("Review thread")).toBeNull();
    expect(threadIds()).toEqual(["thr_pinned", "thr_later", "thr_personal"]);
  });

  it("keys its slot and preferences mirror by its own plugin id", async () => {
    window.localStorage.clear();
    expect(registration.id).toBe("thread-list");
    renderList({ organizationMode: "machine" }, { pluginId: "thread-list" });

    await screen.findByText("Pinned thread");
    expect(
      JSON.parse(
        window.localStorage.getItem("bb.thread-list.preferences.v1") ?? "{}",
      ).organizationMode,
    ).toBe("machine");
    window.localStorage.clear();
  });

  it.each([true, false])(
    "renders personal rows once with standard projects: %s",
    async (includeStandardProjects) => {
      setPreferencesMirrorStorageForTest(null);
      renderList(
        { organizationMode: "project" },
        {
          sidebarThreads: {
            projects: includeStandardProjects
              ? PROJECTS
              : PROJECTS.filter((project) => project.isPersonal),
            sections: [],
            threads: THREADS.filter(
              (thread) => thread.projectId === PERSONAL_PROJECT_ID,
            ),
          },
        },
      );

      await screen.findByTitle("Threads");
      expect(threadIds()).toEqual(["thr_personal"]);
      expect(sectionHeaders()).toEqual(
        includeStandardProjects ? ["App", "Web", "Threads"] : ["Threads"],
      );
    },
  );

  it("calls onNavigate when a thread row is opened", async () => {
    setPreferencesMirrorStorageForTest(null);
    const listProps = props();
    renderSlot(registration, listProps, {
      sidebarThreads: {
        projects: PROJECTS,
        sections: SECTIONS,
        threads: THREADS,
      },
      rpc: {
        listPreferences: () => ({
          preferences: {
            ...defaultPreferences(),
            organizationMode: "chronological",
          },
        }),
      },
    });
    const link = await screen.findByRole("link", {
      name: "Open Personal thread",
    });
    link.click();
    await waitFor(() => expect(listProps.onNavigate).toHaveBeenCalledOnce());
  });
});
