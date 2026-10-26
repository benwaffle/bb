import { describe, expect, it } from "vitest";
import type {
  TimelineCommandWorkRow,
  TimelineRow,
  TimelineRowStatus,
  TimelineTurnRow,
} from "@bb/server-contract";
import {
  findLatestBackgroundableCommandRow,
  isBackgroundableCommandRow,
} from "../src/index.js";

function commandRow(args: {
  callId: string;
  status: TimelineRowStatus;
  approvalStatus?: TimelineCommandWorkRow["approvalStatus"];
}): TimelineCommandWorkRow {
  return {
    id: `row-${args.callId}`,
    threadId: "thread-1",
    turnId: "turn-1",
    sourceSeqStart: 1,
    sourceSeqEnd: 1,
    startedAt: 1,
    createdAt: 1,
    kind: "work",
    workKind: "command",
    status: args.status,
    callId: args.callId,
    command: "sleep 600",
    cwd: null,
    source: null,
    output: "",
    exitCode: null,
    completedAt: null,
    approvalStatus: args.approvalStatus ?? null,
    activityIntents: [],
  };
}

function turnRow(children: TimelineRow[] | null): TimelineTurnRow {
  return {
    id: "turn-row-1",
    threadId: "thread-1",
    turnId: "turn-1",
    sourceSeqStart: 1,
    sourceSeqEnd: 1,
    startedAt: 1,
    createdAt: 1,
    kind: "turn",
    status: "pending",
    summaryCount: 0,
    completedAt: null,
    children,
  };
}

describe("isBackgroundableCommandRow", () => {
  it.each([
    { status: "pending", approvalStatus: null, expected: true },
    { status: "completed", approvalStatus: null, expected: false },
    { status: "interrupted", approvalStatus: null, expected: false },
    {
      status: "pending",
      approvalStatus: "waiting_for_approval",
      expected: false,
    },
  ] as const)(
    "is $expected for a $status command with approval $approvalStatus",
    ({ status, approvalStatus, expected }) => {
      expect(
        isBackgroundableCommandRow(
          commandRow({ callId: "call-1", status, approvalStatus }),
        ),
      ).toBe(expected);
    },
  );
});

describe("findLatestBackgroundableCommandRow", () => {
  it("returns the most recent running command, including inside a turn", () => {
    const rows: TimelineRow[] = [
      commandRow({ callId: "older-running", status: "pending" }),
      turnRow([
        commandRow({ callId: "nested-running", status: "pending" }),
        commandRow({ callId: "nested-done", status: "completed" }),
      ]),
    ];

    expect(findLatestBackgroundableCommandRow(rows)?.callId).toBe(
      "nested-running",
    );
  });

  it("returns null when no command is running", () => {
    expect(
      findLatestBackgroundableCommandRow([
        commandRow({ callId: "done", status: "completed" }),
        turnRow(null),
      ]),
    ).toBeNull();
  });
});
