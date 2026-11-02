import { describe, expect, it } from "vitest";
import {
  advanceGrace,
  EMPTY_GRACE_STATE,
  graceStatus,
  isInGrace,
  nextGraceExpiry,
  WORKING_EXIT_GRACE_MS,
  type GraceObservation,
} from "./grace.js";
import { buildInboxEntries, buildInboxLayout } from "./layout.js";
import { testThread } from "./test-thread.js";

function observe(
  id: string,
  status: GraceObservation["status"],
  isPinned = false,
): GraceObservation {
  return { id, status, isPinned };
}

describe("advanceGrace", () => {
  it("holds a thread that stopped working for 2 seconds, then records its return", () => {
    const working = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "working")], 0);
    expect(working.workingSince.get("t")).toBe(0);

    const stopped = advanceGrace(working, [observe("t", "done")], 10_000);
    expect(isInGrace(stopped, "t")).toBe(true);
    expect(nextGraceExpiry(stopped)).toBe(10_000 + WORKING_EXIT_GRACE_MS);

    const stillHeld = advanceGrace(stopped, [observe("t", "done")], 11_999);
    expect(isInGrace(stillHeld, "t")).toBe(true);

    const returned = advanceGrace(stillHeld, [observe("t", "done")], 12_000);
    expect(isInGrace(returned, "t")).toBe(false);
    expect(returned.workingSince.has("t")).toBe(false);
    expect(returned.returnedAt.get("t")).toBe(10_000);
  });

  it("keeps the original start when work resumes inside the grace", () => {
    const working = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "working")], 0);
    const stopped = advanceGrace(working, [observe("t", "idle")], 5_000);
    const resumed = advanceGrace(stopped, [observe("t", "working")], 6_000);
    expect(isInGrace(resumed, "t")).toBe(false);
    expect(resumed.workingSince.get("t")).toBe(0);
    expect(resumed.returnedAt.has("t")).toBe(false);
  });

  it.each([
    ["needs an approval", observe("t", "approval")],
    ["asks a question", observe("t", "input")],
    ["fails", observe("t", "failed")],
    ["is pinned", observe("t", "done", true)],
  ])("skips the grace when the thread %s", (_name, observation) => {
    const working = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "working")], 0);
    const next = advanceGrace(working, [observation], 1_000);
    expect(isInGrace(next, "t")).toBe(false);
    expect(next.returnedAt.get("t")).toBe(1_000);
  });

  it("gives no grace to a background command, which is not working", () => {
    const running = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "background")], 0);
    expect(running.workingSince.has("t")).toBe(false);
    const ended = advanceGrace(running, [observe("t", "done")], 30_000);
    expect(isInGrace(ended, "t")).toBe(false);
  });

  it("holds a turn that ends with a background command still running as working", () => {
    const working = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "working")], 0);
    const ended = advanceGrace(working, [observe("t", "background")], 10_000);
    expect(graceStatus(ended, "t")).toBe("working");
    const returned = advanceGrace(ended, [observe("t", "background")], 12_000);
    expect(graceStatus(returned, "t")).toBeNull();
    expect(returned.returnedAt.get("t")).toBe(10_000);
  });

  it("gives no grace to a thread first seen idle", () => {
    const next = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "done")], 0);
    expect(isInGrace(next, "t")).toBe(false);
    expect(nextGraceExpiry(next)).toBeNull();
  });

  it("forgets threads that left the list", () => {
    const working = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "working")], 0);
    const stopped = advanceGrace(working, [observe("t", "done")], 1_000);
    expect(advanceGrace(stopped, [], 1_500)).toEqual(EMPTY_GRACE_STATE);
  });
});

describe("section placement through the grace", () => {
  it("keeps a just-finished thread in Working, then moves it to the top of the Inbox", () => {
    const older = testThread("older", { isUnread: true, latestAttentionAt: 5_000 });
    const runningThread = testThread("t", {
      status: "active",
      runtimeStatus: "active",
      latestAttentionAt: 1_000,
    });
    const finishedThread = testThread("t", { isUnread: true, latestAttentionAt: 1_000 });

    const working = advanceGrace(EMPTY_GRACE_STATE, [observe("t", "working")], 0);
    const stopped = advanceGrace(working, [observe("t", "done")], 9_000);
    const during = buildInboxLayout(
      buildInboxEntries([older, finishedThread], {}, stopped),
      [],
    );
    expect(during.working.nodes.map(idOf)).toEqual(["t"]);
    expect(during.inbox.nodes.map(idOf)).toEqual(["older"]);

    const returned = advanceGrace(stopped, [observe("t", "done")], 11_000);
    const after = buildInboxLayout(
      buildInboxEntries([older, finishedThread], {}, returned),
      [],
    );
    expect(after.working.nodes).toEqual([]);
    expect(after.inbox.nodes.map(idOf)).toEqual(["t", "older"]);

    const before = buildInboxLayout(
      buildInboxEntries([older, runningThread], {}, working),
      [],
    );
    expect(before.working.nodes.map(idOf)).toEqual(["t"]);
  });
});

function idOf(node: { kind: string; entry?: { thread: { id: string } } }) {
  return node.entry?.thread.id;
}
