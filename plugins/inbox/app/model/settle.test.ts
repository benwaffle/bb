import type { ExperimentalResolvedSidebarThreadGroup } from "@get-bb/plugin-sdk/app";
import { describe, expect, it } from "vitest";
import { nextSnoozeWake, type InboxThreadStates } from "../../shared/inbox-state.js";
import { EMPTY_GRACE_STATE } from "./grace.js";
import {
  buildInboxEntries,
  buildInboxLayout,
  parkedPlacement,
  type InboxLayout,
  type InboxNode,
  type InboxSection,
} from "./layout.js";
import { activity, testThread } from "./test-thread.js";

const SETTLED_AT = 5_000;
const NOW = 10_000;

function layoutOf(
  threads: Parameters<typeof buildInboxEntries>[0],
  states: InboxThreadStates,
  options: {
    now?: number;
    kinds?: Parameters<typeof buildInboxEntries>[1];
    groups?: readonly ExperimentalResolvedSidebarThreadGroup[];
  } = {},
): InboxLayout {
  return buildInboxLayout(
    buildInboxEntries(
      threads,
      options.kinds ?? {},
      EMPTY_GRACE_STATE,
      states,
      options.now ?? NOW,
    ),
    options.groups ?? [],
  );
}

function ids(nodes: readonly InboxNode[]): string[] {
  return nodes.map((node) =>
    node.kind === "thread" ? node.entry.thread.id : `group:${node.group.key}`,
  );
}

function sectionOf(layout: InboxLayout, threadId: string): InboxSection | null {
  for (const [section, { nodes }] of Object.entries(layout)) {
    const contains = (node: InboxNode): boolean =>
      node.kind === "group"
        ? node.rows.some(contains)
        : node.entry.thread.id === threadId || node.children.some(contains);
    if (nodes.some(contains)) return section as InboxSection;
  }
  return null;
}

const settled = { settledAt: SETTLED_AT, snoozeUntil: null };

describe("settled threads", () => {
  it("leave Inbox and Done for the Settled shelf, whatever their status", () => {
    const layout = layoutOf(
      [
        testThread("unread", { isUnread: true, latestAttentionAt: 4_000 }),
        testThread("read", { latestAttentionAt: 4_000 }),
        testThread("failed", { status: "error", latestAttentionAt: 4_000 }),
        testThread("dev-server", {
          latestAttentionAt: 4_000,
          activity: activity({ backgroundCommands: 1 }),
        }),
        testThread("pinned", { isPinned: true, pinnedAt: 1, latestAttentionAt: 4_000 }),
        testThread("other", { isUnread: true }),
      ],
      {
        unread: settled,
        read: settled,
        failed: settled,
        "dev-server": settled,
        pinned: settled,
      },
    );
    expect(ids(layout.settled.nodes).sort()).toEqual([
      "dev-server",
      "failed",
      "pinned",
      "read",
      "unread",
    ]);
    expect(layout.settled.threadCount).toBe(5);
    expect(ids(layout.inbox.nodes)).toEqual(["other"]);
    expect(layout.pinned.nodes).toEqual([]);
    expect(layout.working.nodes).toEqual([]);
  });

  it("sorts the Settled shelf by settle time, newest first", () => {
    const layout = layoutOf(
      [testThread("old", { latestAttentionAt: 1 }), testThread("new", { latestAttentionAt: 1 })],
      {
        old: { settledAt: 2_000, snoozeUntil: null },
        new: { settledAt: 3_000, snoozeUntil: null },
      },
    );
    expect(ids(layout.settled.nodes)).toEqual(["new", "old"]);
  });

  it("wake when latestAttentionAt moves past settledAt", () => {
    const layout = layoutOf(
      [testThread("woken", { isUnread: true, latestAttentionAt: SETTLED_AT + 1 })],
      { woken: settled },
    );
    expect(sectionOf(layout, "woken")).toBe("inbox");
  });

  it("stay settled when latestAttentionAt equals settledAt", () => {
    const layout = layoutOf(
      [testThread("same", { latestAttentionAt: SETTLED_AT })],
      { same: settled },
    );
    expect(sectionOf(layout, "same")).toBe("settled");
  });

  it("wake for a pending approval or question", () => {
    const layout = layoutOf(
      [
        testThread("approval", { hasPendingInteraction: true, latestAttentionAt: 1 }),
        testThread("question", { hasPendingInteraction: true, latestAttentionAt: 1 }),
      ],
      { approval: settled, question: settled },
      { kinds: { approval: "approval" } },
    );
    expect(sectionOf(layout, "approval")).toBe("inbox");
    expect(sectionOf(layout, "question")).toBe("inbox");
  });

  it("wake into Working when a new turn starts", () => {
    const layout = layoutOf(
      [testThread("resumed", { status: "active", runtimeStatus: "active", latestAttentionAt: 1 })],
      { resumed: settled },
    );
    expect(sectionOf(layout, "resumed")).toBe("working");
  });

  it("return to Pinned when a pinned thread wakes", () => {
    const layout = layoutOf(
      [testThread("pin", { isPinned: true, pinnedAt: 1, latestAttentionAt: SETTLED_AT + 1 })],
      { pin: settled },
    );
    expect(sectionOf(layout, "pin")).toBe("pinned");
  });

  it("ignore archived threads", () => {
    const layout = layoutOf(
      [testThread("gone", { isArchived: true, archivedAt: 1, latestAttentionAt: 1 })],
      { gone: settled },
    );
    expect(layout.settled.threadCount).toBe(0);
  });
});

describe("snoozed threads", () => {
  const snoozed = { settledAt: SETTLED_AT, snoozeUntil: NOW + 60_000 };

  it("sit in the Snoozed shelf, soonest wake first", () => {
    const layout = layoutOf(
      [
        testThread("later", { latestAttentionAt: 1 }),
        testThread("sooner", { latestAttentionAt: 1 }),
      ],
      {
        later: { settledAt: SETTLED_AT, snoozeUntil: NOW + 120_000 },
        sooner: snoozed,
      },
    );
    expect(ids(layout.snoozed.nodes)).toEqual(["sooner", "later"]);
    expect(layout.snoozed.threadCount).toBe(2);
    expect(layout.settled.threadCount).toBe(0);
  });

  it("return to Inbox at the wake time even when read, sorted as just returned", () => {
    const layout = layoutOf(
      [
        testThread("expired", { latestAttentionAt: 1 }),
        testThread("recent", { isUnread: true, latestAttentionAt: NOW - 1 }),
      ],
      { expired: { settledAt: SETTLED_AT, snoozeUntil: NOW } },
    );
    expect(ids(layout.inbox.nodes)).toEqual(["expired", "recent"]);
  });

  it("return early on a wake event", () => {
    const layout = layoutOf(
      [testThread("early", { isUnread: true, latestAttentionAt: SETTLED_AT + 10 })],
      { early: snoozed },
    );
    expect(sectionOf(layout, "early")).toBe("inbox");
  });

  it("report the next wake time for the clock", () => {
    expect(
      nextSnoozeWake(
        {
          a: { settledAt: 1, snoozeUntil: NOW - 1 },
          b: { settledAt: 1, snoozeUntil: NOW + 500 },
          c: { settledAt: 1, snoozeUntil: NOW + 100 },
          d: settled,
        },
        NOW,
      ),
    ).toBe(NOW + 100);
    expect(nextSnoozeWake({ d: settled }, NOW)).toBeNull();
  });
});

describe("parkedPlacement", () => {
  const thread = { latestAttentionAt: 1 };
  it("is null without a stored state", () => {
    expect(parkedPlacement(thread, "idle", null, NOW)).toBeNull();
  });
  it("keeps a running background command parked", () => {
    expect(parkedPlacement(thread, "background", settled, NOW)).toBe("settled");
  });
  it("keeps a failure from before the settle parked", () => {
    expect(parkedPlacement(thread, "failed", settled, NOW)).toBe("settled");
  });
});

describe("children of settled threads", () => {
  it("stay nested when done, and leave when they need you or work", () => {
    const layout = layoutOf(
      [
        testThread("parent", { latestAttentionAt: 1 }),
        testThread("quiet", { parentThreadId: "parent", createdAt: 2 }),
        testThread("asks", {
          parentThreadId: "parent",
          hasPendingInteraction: true,
          createdAt: 3,
        }),
        testThread("works", {
          parentThreadId: "parent",
          status: "active",
          runtimeStatus: "active",
          createdAt: 4,
        }),
      ],
      { parent: settled },
    );
    expect(sectionOf(layout, "quiet")).toBe("settled");
    expect(sectionOf(layout, "asks")).toBe("inbox");
    expect(sectionOf(layout, "works")).toBe("working");
    expect(layout.settled.threadCount).toBe(2);
  });

  it("a settled child leaves its parent for the Settled shelf", () => {
    const layout = layoutOf(
      [
        testThread("parent", { isUnread: true }),
        testThread("child", { parentThreadId: "parent", latestAttentionAt: 1 }),
      ],
      { child: settled },
    );
    expect(sectionOf(layout, "parent")).toBe("inbox");
    expect(ids(layout.settled.nodes)).toEqual(["child"]);
    const [child] = layout.settled.nodes;
    expect(child?.kind === "thread" ? child.detachedFrom?.id : null).toBe("parent");
  });
});
