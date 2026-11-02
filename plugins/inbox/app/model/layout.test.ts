import type { ExperimentalResolvedSidebarThreadGroup } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import { EMPTY_GRACE_STATE } from "./grace.js";
import {
  buildInboxEntries,
  buildInboxLayout,
  childEscapesParent,
  type InboxLayout,
  type InboxNode,
} from "./layout.js";
import { testThread } from "./test-thread.js";

function layoutOf(
  threads: Parameters<typeof buildInboxEntries>[0],
  groups: readonly ExperimentalResolvedSidebarThreadGroup[] = [],
  kinds: Parameters<typeof buildInboxEntries>[1] = {},
): InboxLayout {
  return buildInboxLayout(
    buildInboxEntries(threads, kinds, EMPTY_GRACE_STATE),
    groups,
  );
}

function ids(nodes: readonly InboxNode[]): string[] {
  return nodes.map((node) =>
    node.kind === "thread" ? node.entry.thread.id : `group:${node.group.key}`,
  );
}

function thread(node: InboxNode | undefined) {
  if (node?.kind !== "thread") throw new Error("expected a thread node");
  return node;
}

describe("section placement", () => {
  it("sorts each thread into Pinned, Inbox or Working", () => {
    const layout = layoutOf(
      [
        testThread("pinned-working", {
          isPinned: true,
          pinnedAt: 1,
          status: "active",
          runtimeStatus: "active",
        }),
        testThread("approval", { hasPendingInteraction: true }),
        testThread("question", { hasPendingInteraction: true }),
        testThread("failed", { status: "error", runtimeStatus: "error" }),
        testThread("unread", { isUnread: true }),
        testThread("running", { status: "active", runtimeStatus: "active" }),
        testThread("read"),
        testThread("dev-server", {
          activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 1, planMode: 0, goals: 0 },
        }),
        testThread("archived", {
          isArchived: true,
          archivedAt: 5,
          isUnread: true,
          activity: { workflows: 0, backgroundAgents: 0, backgroundCommands: 1, planMode: 0, goals: 0 },
        }),
        testThread("hidden", { isHidden: true, isUnread: true }),
      ],
      [],
      { approval: "approval", question: "input" },
    );
    expect(ids(layout.pinned.nodes)).toEqual(["pinned-working"]);
    expect(new Set(ids(layout.inbox.nodes))).toEqual(
      new Set(["approval", "question", "failed", "unread", "read"]),
    );
    expect(new Set(ids(layout.working.nodes))).toEqual(new Set(["running", "dev-server"]));
    expect(thread(layout.inbox.nodes.find((node) => node.kind === "thread" && node.entry.thread.id === "approval")).entry.status).toBe("approval");
    expect(layout.inbox.threadCount).toBe(5);
  });

  it("keeps an idle thread in the inbox after it is read, ordered by its last activity", () => {
    const layout = layoutOf([
      testThread("read-new", { latestAttentionAt: 300 }),
      testThread("unread-mid", { isUnread: true, latestAttentionAt: 200 }),
      testThread("read-old", { latestAttentionAt: 100 }),
    ]);
    expect(ids(layout.inbox.nodes)).toEqual(["read-new", "unread-mid", "read-old"]);
    expect(
      layout.inbox.nodes.map((node) => thread(node).entry.status),
    ).toEqual(["idle", "done", "idle"]);
  });

  it("orders the inbox by newest return and pins by manual order", () => {
    const layout = layoutOf([
      testThread("old", { isUnread: true, latestAttentionAt: 100 }),
      testThread("new", { isUnread: true, latestAttentionAt: 300 }),
      testThread("mid", { status: "error", runtimeStatus: "error", latestAttentionAt: 200 }),
      testThread("pin-late", { isPinned: true, pinnedAt: 50, pinSortKey: null }),
      testThread("pin-b", { isPinned: true, pinnedAt: 10, pinSortKey: "b" }),
      testThread("pin-a", { isPinned: true, pinnedAt: 20, pinSortKey: "a" }),
    ]);
    expect(ids(layout.inbox.nodes)).toEqual(["new", "mid", "old"]);
    expect(ids(layout.pinned.nodes)).toEqual(["pin-a", "pin-b", "pin-late"]);
  });
});

describe("child nesting", () => {
  const read = { section: "inbox", status: "idle", parked: null } as const;
  const unread = { section: "inbox", status: "done", parked: null } as const;
  const working = { section: "working", status: "working", parked: null } as const;
  const pinned = { section: "pinned", status: "idle", parked: null } as const;
  it.each([
    ["read", read, "inbox", false],
    ["read", read, "working", false],
    ["read", read, "pinned", false],
    ["read", read, "settled", false],
    ["unread", unread, "inbox", false],
    ["unread", unread, "working", true],
    ["unread", unread, "pinned", true],
    ["unread", unread, "settled", true],
    ["working", working, "inbox", false],
    ["working", working, "pinned", false],
    ["working", working, "snoozed", true],
    ["pinned", pinned, "inbox", true],
  ] as const)("a %s child under a %s parent escapes: %s", (_name, child, parent, escapes) => {
    expect(childEscapesParent(child, parent)).toBe(escapes);
  });

  it("nests quiet children under their parent and counts them in its section", () => {
    const layout = layoutOf([
      testThread("parent", { isUnread: true }),
      testThread("child-b", { parentThreadId: "parent", createdAt: 3 }),
      testThread("child-a", {
        parentThreadId: "parent",
        createdAt: 2,
        status: "active",
        runtimeStatus: "active",
      }),
      testThread("grandchild", { parentThreadId: "child-b" }),
    ]);
    expect(ids(layout.inbox.nodes)).toEqual(["parent"]);
    const parent = thread(layout.inbox.nodes[0]);
    expect(parent.children.map((child) => child.entry.thread.id)).toEqual([
      "child-a",
      "child-b",
    ]);
    expect(parent.children[1]!.children.map((child) => child.entry.thread.id)).toEqual([
      "grandchild",
    ]);
    expect(layout.inbox.threadCount).toBe(4);
    expect(layout.working.nodes).toEqual([]);
  });

  it("shows a child that needs you apart from a working parent, marked with its parent", () => {
    const layout = layoutOf(
      [
        testThread("parent", {
          displayTitle: "Orchestrator",
          status: "active",
          runtimeStatus: "active",
        }),
        testThread("asking", { parentThreadId: "parent", hasPendingInteraction: true }),
        testThread("quiet", { parentThreadId: "parent" }),
      ],
      [],
      { asking: "input" },
    );
    expect(ids(layout.inbox.nodes)).toEqual(["asking"]);
    expect(thread(layout.inbox.nodes[0]).detachedFrom).toEqual({
      id: "parent",
      title: "Orchestrator",
    });
    expect(ids(layout.working.nodes)).toEqual(["parent"]);
    expect(thread(layout.working.nodes[0]).children.map((c) => c.entry.thread.id)).toEqual([
      "quiet",
    ]);
  });

  it("follows the parent's displayed section for nested grandchildren", () => {
    const layout = layoutOf([
      testThread("root", { isUnread: true }),
      testThread("mid", { parentThreadId: "root" }),
      testThread("leaf", { parentThreadId: "mid", status: "active", runtimeStatus: "active" }),
    ]);
    expect(ids(layout.inbox.nodes)).toEqual(["root"]);
    expect(layout.working.nodes).toEqual([]);
    expect(layout.inbox.threadCount).toBe(3);
  });

  it("treats a child whose parent is not listed as a root without a parent mark", () => {
    const layout = layoutOf([
      testThread("orphan", { parentThreadId: "gone", isUnread: true }),
    ]);
    expect(thread(layout.inbox.nodes[0]).detachedFrom).toBeNull();
  });
});

function group(
  key: string,
  threadIds: string[],
  rows: ExperimentalResolvedSidebarThreadGroup["rows"] = [],
): ExperimentalResolvedSidebarThreadGroup {
  return {
    id: `pr-review:${key}`,
    pluginId: "pr-review",
    projectId: "proj_a",
    key,
    label: `Ticket ${key}`,
    keyLabel: key,
    threadIds,
    rows,
    keepOrder: false,
    style: "flat",
  };
}

describe("thread groups", () => {
  it("places a group in the most urgent section among its threads", () => {
    const layout = layoutOf(
      [
        testThread("review-a", { status: "active", runtimeStatus: "active" }),
        testThread("review-b", { isUnread: true, latestAttentionAt: 50 }),
        testThread("other", { isUnread: true, latestAttentionAt: 10 }),
      ],
      [group("ABC-1", ["review-a", "review-b"])],
    );
    expect(ids(layout.inbox.nodes)).toEqual(["group:ABC-1", "other"]);
    expect(layout.working.nodes).toEqual([]);
    expect(layout.inbox.threadCount).toBe(3);
  });

  it("puts an all-working group in Working and an all-read group in Inbox", () => {
    const layout = layoutOf(
      [
        testThread("w1", { status: "active", runtimeStatus: "active" }),
        testThread("w2", { status: "starting", runtimeStatus: "starting" }),
        testThread("d1"),
        testThread("d2"),
      ],
      [group("W", ["w1", "w2"]), group("D", ["d1", "d2"])],
    );
    expect(ids(layout.working.nodes)).toEqual(["group:W"]);
    expect(ids(layout.inbox.nodes)).toEqual(["group:D"]);
  });

  it("leaves a lone thread as a plain row and keeps pinned threads out", () => {
    const layout = layoutOf(
      [
        testThread("solo", { isUnread: true }),
        testThread("pinned", { isPinned: true, pinnedAt: 1 }),
      ],
      [group("ONE", ["solo", "pinned"])],
    );
    expect(ids(layout.inbox.nodes)).toEqual(["solo"]);
    expect(ids(layout.pinned.nodes)).toEqual(["pinned"]);
  });

  it("keeps a group with placeholder rows even with one thread", () => {
    const layout = layoutOf(
      [testThread("solo", { isUnread: true })],
      [
        group("PH", ["solo"], [
          { id: "pr-12", title: "#12 Fix it", onSelect: () => undefined },
        ]),
      ],
    );
    expect(ids(layout.inbox.nodes)).toEqual(["group:PH"]);
    const node = layout.inbox.nodes[0]!;
    expect(node.kind === "group" ? node.placeholders.map((row) => row.id) : []).toEqual([
      "pr-12",
    ]);
  });
});
