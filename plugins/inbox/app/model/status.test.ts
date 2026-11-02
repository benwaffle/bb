import { describe, expect, it } from "vitest";
import { deriveInboxStatus } from "./status.js";
import { activity, testThread } from "./test-thread.js";

describe("deriveInboxStatus", () => {
  it.each([
    [
      "an approval outranks a running turn",
      testThread("t", { hasPendingInteraction: true, status: "active", runtimeStatus: "active" }),
      "approval" as const,
      "approval",
    ],
    [
      "a question is input",
      testThread("t", { hasPendingInteraction: true }),
      "input" as const,
      "input",
    ],
    [
      "a pending interaction of unknown kind reads as input",
      testThread("t", { hasPendingInteraction: true }),
      null,
      "input",
    ],
    [
      "a running turn is working",
      testThread("t", { status: "active", runtimeStatus: "active" }),
      null,
      "working",
    ],
    [
      "a thread provisioning its machine is working",
      testThread("t", { status: "starting", runtimeStatus: "provisioning" }),
      null,
      "working",
    ],
    [
      "a pending thread with a waiting message is working",
      testThread("t", { status: "pending", runtimeStatus: "pending", queuedWork: "waiting" }),
      null,
      "working",
    ],
    [
      "an errored thread failed",
      testThread("t", { status: "error", runtimeStatus: "error", isUnread: true }),
      null,
      "failed",
    ],
    [
      "a failed queued message failed",
      testThread("t", { queuedWork: "failed" }),
      null,
      "failed",
    ],
    [
      "an unread idle thread is done",
      testThread("t", { isUnread: true, indicator: "unread-success" }),
      null,
      "done",
    ],
    [
      "a read idle thread is idle",
      testThread("t"),
      null,
      "idle",
    ],
  ])("%s", (_name, thread, kind, expected) => {
    expect(deriveInboxStatus(thread, kind)).toBe(expected);
  });

  it("keeps a turn that waits on a background command it started in Working", () => {
    const sleepDuringTurn = testThread("t", {
      status: "active",
      runtimeStatus: "active",
      activity: activity({ backgroundCommands: 1 }),
    });
    expect(deriveInboxStatus(sleepDuringTurn, null)).toBe("working");
  });

  it("keeps a dev server that outlives the turn in Working as background work", () => {
    const devServerAfterTurn = testThread("t", {
      status: "idle",
      runtimeStatus: "idle",
      isUnread: true,
      indicator: "background-command",
      activity: activity({ backgroundCommands: 1 }),
    });
    expect(deriveInboxStatus(devServerAfterTurn, null)).toBe("background");
    expect(
      deriveInboxStatus({ ...devServerAfterTurn, isUnread: false }, null),
    ).toBe("background");
  });

  it("lets attention outrank background work", () => {
    const withServer = { activity: activity({ backgroundCommands: 2 }) };
    expect(
      deriveInboxStatus(testThread("t", { ...withServer, hasPendingInteraction: true }), "approval"),
    ).toBe("approval");
    expect(
      deriveInboxStatus(
        testThread("t", { ...withServer, status: "error", runtimeStatus: "error" }),
        null,
      ),
    ).toBe("failed");
  });

  it("ignores background commands on archived threads", () => {
    const archived = testThread("t", {
      isArchived: true,
      archivedAt: 5,
      activity: activity({ backgroundCommands: 1 }),
    });
    expect(deriveInboxStatus(archived, null)).toBe("idle");
  });

  it("ignores background agents and workflows reported while idle", () => {
    const thread = testThread("t", {
      isUnread: true,
      activity: activity({ backgroundAgents: 1, workflows: 1, goals: 1 }),
    });
    expect(deriveInboxStatus(thread, null)).toBe("done");
  });
});
