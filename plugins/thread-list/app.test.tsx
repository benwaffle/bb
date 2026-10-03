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
import { makePluginProject, makeSidebarThread } from "./app/model/fixtures.js";
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

    expect(inspection.sidebarActionCalls).toContainEqual({
      method: "openNewThread",
      options: {
        projectId: PERSONAL_PROJECT_ID,
        hostId: "host_laptop",
        experimental_placement: { sectionId: null, pinned: false },
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
            rows: [
              {
                id: "hss#600",
                title: "#600 Batch the importer",
                description: "ana",
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

    fireEvent.click(screen.getByText("#600 Batch the importer"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.click(within(ticketGroup).getByRole("button", { name: "Start" }));
    expect(run).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Collapse CORE-21" }));
    await waitFor(() =>
      expect(screen.queryByText("#600 Batch the importer")).toBeNull(),
    );
    expect(screen.queryByText("Review thread")).toBeNull();
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
    const { inspection } = renderList(
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
            threadIds: ["thr_parent", "thr_review"],
            rows: [
              placeholder("#552 Base"),
              {
                threadId: "thr_review",
                depth: 1,
                description: "stacked on #552",
              },
              placeholder("#560 Top"),
            ],
            keepOrder: true,
          },
        ],
      },
    );

    const ticketGroup = (await screen.findByText("CORE-21")).closest(
      "[data-sidebar-sticky-group]",
    ) as HTMLElement;
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
    expect(
      reviewRow.querySelector("[data-sidebar-thread-depth]")?.textContent,
    ).toBe("└\u00a0");
    expect(
      reviewRow.querySelector("[data-sidebar-thread-description]")?.textContent,
    ).toBe("stacked on #552");
    const parentRow = ticketGroup
      .querySelector('[data-sidebar-thread-id="thr_parent"]')
      ?.closest("[data-sidebar-rename-row]") as HTMLElement;
    expect(parentRow.querySelector("[data-sidebar-thread-depth]")).toBeNull();

    fireEvent.click(
      within(reviewRow).getByRole("button", { name: "Archive thread" }),
    );
    fireEvent.doubleClick(within(reviewRow).getByText("Review thread"));
    const input = await screen.findByRole("textbox", { name: "Thread name" });
    expect(
      reviewRow.querySelector("[data-sidebar-thread-description]"),
    ).toBeNull();
    fireEvent.change(input, { target: { value: "Renamed review" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() =>
      expect(inspection.sidebarActionCalls).toEqual([
        { method: "archive", threadId: "thr_review" },
        { method: "rename", threadId: "thr_review", title: "Renamed review" },
      ]),
    );
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
