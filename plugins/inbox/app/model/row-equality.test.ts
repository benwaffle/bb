import { describe, expect, it } from "vitest";
import { EMPTY_GRACE_STATE } from "./grace.js";
import {
  buildInboxEntries,
  buildInboxLayout,
  type InboxNode,
  type InboxThreadNode,
} from "./layout.js";
import { activeChangeAffects, sameThreadNode } from "./row-equality.js";
import { testThread } from "./test-thread.js";

function inboxRoots(
  threads: Parameters<typeof buildInboxEntries>[0],
): InboxThreadNode[] {
  return buildInboxLayout(
    buildInboxEntries(threads, {}, EMPTY_GRACE_STATE),
    [],
  ).inbox.nodes.filter(
    (node: InboxNode): node is InboxThreadNode => node.kind === "thread",
  );
}

describe("sameThreadNode", () => {
  const parent = testThread("thr_parent", { latestAttentionAt: 3_000 });
  const child = testThread("thr_child", {
    parentThreadId: "thr_parent",
    createdAt: 2_000,
  });
  const other = testThread("thr_other", { latestAttentionAt: 2_000 });

  it("treats a rebuilt layout of unchanged threads as equal", () => {
    const before = inboxRoots([parent, child, other]);
    const after = inboxRoots([parent, child, other]);
    expect(after[0]).not.toBe(before[0]);
    expect(after.map((node, index) => sameThreadNode(before[index]!, node))).toEqual([
      true,
      true,
    ]);
  });

  it("detects a changed thread, including one nested as a child", () => {
    const before = inboxRoots([parent, child, other]);
    const after = inboxRoots([
      parent,
      { ...child, displayTitle: "renamed" },
      other,
    ]);
    expect(sameThreadNode(before[0]!, after[0]!)).toBe(false);
    expect(sameThreadNode(before[1]!, after[1]!)).toBe(true);
  });
});

describe("activeChangeAffects", () => {
  const [root] = inboxRoots([
    testThread("thr_parent"),
    testThread("thr_child", { parentThreadId: "thr_parent" }),
  ]);

  it("re-renders a row only when the active thread enters or leaves its subtree", () => {
    expect(activeChangeAffects(root!, "thr_x", "thr_y")).toBe(false);
    expect(activeChangeAffects(root!, "thr_x", "thr_child")).toBe(true);
    expect(activeChangeAffects(root!, "thr_parent", null)).toBe(true);
    expect(activeChangeAffects(root!, "thr_child", "thr_child")).toBe(false);
  });
});
