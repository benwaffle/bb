import { describe, expect, it } from "vitest";
import {
  encodeClientTurnRequestIdNumber,
  threadScope,
  turnScope,
} from "@bb/domain";
import type { ClientTurnRequestId, Thread, ThreadEventType } from "@bb/domain";
import {
  createProject,
  createThread,
  insertEvents,
  noopNotifier,
  upsertHost,
} from "@bb/db";
import { createMigratedConnection } from "@bb/db/testing";
import type { DbConnection } from "@bb/db";
import type { TimelineRow } from "@bb/server-contract";
import {
  buildThreadTimelineWithProfile,
  buildTimelineTurnSummaryDetails,
} from "../../../src/services/threads/timeline.js";

const providerThreadId = "provider-root";

const execution = {
  model: "gpt-5",
  serviceTier: "default",
  reasoningLevel: "medium",
  permissionMode: "full",
  source: "client/turn/requested",
} as const;

interface SetupResult {
  db: DbConnection;
  thread: Thread;
}

function setup(): SetupResult {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, {
    name: "test-host",
  });
  const { project } = createProject(db, noopNotifier, {
    name: "test-project",
    source: { type: "local_path", hostId: host.id, path: "/tmp/test" },
  });
  const thread = createThread(db, noopNotifier, {
    projectId: project.id,
    providerId: "claude-code",
  });
  return { db, thread };
}

function requestId(value: number): ClientTurnRequestId {
  return encodeClientTurnRequestIdNumber({ value });
}

interface TurnEventFields {
  itemId?: string;
  itemKind?: "commandExecution" | "delegation";
  parentToolCallId?: string;
  data: Record<string, unknown>;
}

function turnEvent(
  thread: Thread,
  sequence: number,
  type: ThreadEventType,
  turnId: string,
  fields: TurnEventFields,
) {
  return {
    threadId: thread.id,
    sequence,
    type,
    scope: turnScope(turnId),
    providerThreadId,
    itemId: fields.itemId ?? null,
    itemKind: fields.itemKind ?? null,
    parentToolCallId: fields.parentToolCallId ?? null,
    data: JSON.stringify(fields.data),
  };
}

function spawnRequestedEvent(thread: Thread) {
  return {
    threadId: thread.id,
    sequence: 1,
    type: "client/turn/requested" as const,
    scope: threadScope(),
    itemId: null,
    itemKind: null,
    parentToolCallId: null,
    data: JSON.stringify({
      direction: "outbound",
      source: "spawn",
      initiator: "user",
      request: { method: "thread/start", params: {} },
      requestId: requestId(1),
      senderThreadId: null,
      input: [{ type: "text", text: "Spawn a child.", mentions: [] }],
      target: { kind: "thread-start" },
      execution,
    }),
  };
}

function insertCrossWindowSubagentEvents(
  db: DbConnection,
  thread: Thread,
): void {
  const firstRequestId = requestId(1);
  const secondRequestId = requestId(2);
  const thirdRequestId = requestId(3);
  insertEvents(db, noopNotifier, [
    {
      threadId: thread.id,
      sequence: 1,
      type: "client/turn/requested",
      scope: threadScope(),
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({
        direction: "outbound",
        source: "spawn",
        initiator: "user",
        request: { method: "thread/start", params: {} },
        requestId: firstRequestId,
        senderThreadId: null,
        input: [{ type: "text", text: "Start parent turn.", mentions: [] }],
        target: { kind: "thread-start" },
        execution,
      }),
    },
    {
      threadId: thread.id,
      sequence: 2,
      type: "turn/started",
      scope: turnScope("parent-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({}),
    },
    {
      threadId: thread.id,
      sequence: 3,
      type: "turn/input/accepted",
      scope: turnScope("parent-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({ clientRequestId: firstRequestId }),
    },
    {
      threadId: thread.id,
      sequence: 4,
      type: "item/started",
      scope: turnScope("parent-turn"),
      providerThreadId,
      itemId: "toolu_agent_1",
      itemKind: "toolCall",
      parentToolCallId: null,
      data: JSON.stringify({
        item: {
          type: "toolCall",
          id: "toolu_agent_1",
          tool: "Agent",
          arguments: {
            prompt: "Run the child.",
            subagent_type: "general-purpose",
          },
          status: "pending",
        },
      }),
    },
    {
      threadId: thread.id,
      sequence: 5,
      type: "item/completed",
      scope: turnScope("parent-turn"),
      providerThreadId,
      itemId: "toolu_agent_1",
      itemKind: "toolCall",
      parentToolCallId: null,
      data: JSON.stringify({
        item: {
          type: "toolCall",
          id: "toolu_agent_1",
          tool: "Agent",
          arguments: {
            prompt: "Run the child.",
            subagent_type: "general-purpose",
          },
          result: "FIRST_SUBAGENT_OUTPUT",
          status: "completed",
        },
      }),
    },
    {
      threadId: thread.id,
      sequence: 20,
      type: "client/turn/requested",
      scope: threadScope(),
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({
        direction: "outbound",
        source: "tell",
        initiator: "user",
        request: { method: "turn/start", params: {} },
        requestId: secondRequestId,
        senderThreadId: null,
        input: [{ type: "text", text: "Middle turn.", mentions: [] }],
        target: { kind: "new-turn" },
        execution,
      }),
    },
    {
      threadId: thread.id,
      sequence: 21,
      type: "turn/started",
      scope: turnScope("middle-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({}),
    },
    {
      threadId: thread.id,
      sequence: 22,
      type: "turn/input/accepted",
      scope: turnScope("middle-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({ clientRequestId: secondRequestId }),
    },
    {
      threadId: thread.id,
      sequence: 23,
      type: "item/completed",
      scope: turnScope("middle-turn"),
      providerThreadId,
      itemId: "middle-message",
      itemKind: "agentMessage",
      parentToolCallId: null,
      data: JSON.stringify({
        item: {
          type: "agentMessage",
          id: "middle-message",
          text: "Middle response.",
        },
      }),
    },
    {
      threadId: thread.id,
      sequence: 40,
      type: "client/turn/requested",
      scope: threadScope(),
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({
        direction: "outbound",
        source: "tell",
        initiator: "user",
        request: { method: "turn/start", params: {} },
        requestId: thirdRequestId,
        senderThreadId: null,
        input: [{ type: "text", text: "Newest turn.", mentions: [] }],
        target: { kind: "new-turn" },
        execution,
      }),
    },
    {
      threadId: thread.id,
      sequence: 41,
      type: "turn/started",
      scope: turnScope("newest-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({}),
    },
    {
      threadId: thread.id,
      sequence: 42,
      type: "turn/input/accepted",
      scope: turnScope("newest-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      data: JSON.stringify({ clientRequestId: thirdRequestId }),
    },
    {
      threadId: thread.id,
      sequence: 43,
      type: "item/completed",
      scope: turnScope("newest-turn"),
      providerThreadId,
      itemId: "newest-message",
      itemKind: "agentMessage",
      parentToolCallId: null,
      data: JSON.stringify({
        item: {
          type: "agentMessage",
          id: "newest-message",
          text: "Newest response.",
        },
      }),
    },
    {
      threadId: thread.id,
      sequence: 50,
      type: "turn/started",
      scope: turnScope("child-turn"),
      providerThreadId,
      itemId: null,
      itemKind: null,
      parentToolCallId: "toolu_agent_1",
      data: JSON.stringify({ parentToolCallId: "toolu_agent_1" }),
    },
    {
      threadId: thread.id,
      sequence: 51,
      type: "item/completed",
      scope: turnScope("child-turn"),
      providerThreadId,
      itemId: "child-message",
      itemKind: "agentMessage",
      parentToolCallId: "toolu_agent_1",
      data: JSON.stringify({
        item: {
          type: "agentMessage",
          id: "child-message",
          text: "SECOND_SUBAGENT_OUTPUT",
          parentToolCallId: "toolu_agent_1",
        },
      }),
    },
  ]);
}

function nestedRows(row: TimelineRow): readonly TimelineRow[] {
  if (row.kind === "turn") {
    return row.children ?? [];
  }
  if (row.kind === "work" && row.workKind === "delegation") {
    return row.childRows ?? [];
  }
  return [];
}

function flattenRows(rows: readonly TimelineRow[]): TimelineRow[] {
  const flattened: TimelineRow[] = [];
  const visit = (currentRows: readonly TimelineRow[]): void => {
    for (const row of currentRows) {
      flattened.push(row);
      visit(nestedRows(row));
    }
  };
  visit(rows);
  return flattened;
}

function rowTexts(rows: readonly TimelineRow[]): string[] {
  return flattenRows(rows).flatMap((row) =>
    row.kind === "conversation" ? [row.text] : [],
  );
}

describe("thread timeline parented pagination", () => {
  it("keeps child-only subagent output off the latest page", () => {
    const { db, thread } = setup();
    insertCrossWindowSubagentEvents(db, thread);

    const timeline = buildThreadTimelineWithProfile(db, thread, {
      completedTurnDisplay: "collapse",
      eventBudget: 1_000_000,
      includeClearedContextHistory: false,
      includeDiagnosticOperations: false,
      compactionOfferEnabled: false,
      summarizeShellCommands: true,
      includeNestedRows: true,
      maxInlineOutputChars: null,
      maxSeq: 51,
      page: { kind: "latest", segmentLimit: 1 },
    }).response;

    expect(rowTexts(timeline.rows)).toContain("Newest response.");
    expect(rowTexts(timeline.rows)).not.toContain("SECOND_SUBAGENT_OUTPUT");
  });

  it("shows cross-window subagent output under the original Agent row", () => {
    const { db, thread } = setup();
    insertCrossWindowSubagentEvents(db, thread);

    const latest = buildThreadTimelineWithProfile(db, thread, {
      completedTurnDisplay: "collapse",
      eventBudget: 1_000_000,
      includeClearedContextHistory: false,
      includeDiagnosticOperations: false,
      compactionOfferEnabled: false,
      summarizeShellCommands: true,
      includeNestedRows: true,
      maxInlineOutputChars: null,
      maxSeq: 51,
      page: { kind: "latest", segmentLimit: 2 },
    }).response;
    const timeline = buildThreadTimelineWithProfile(db, thread, {
      completedTurnDisplay: "collapse",
      eventBudget: 1_000_000,
      includeClearedContextHistory: false,
      includeDiagnosticOperations: false,
      compactionOfferEnabled: false,
      summarizeShellCommands: true,
      includeNestedRows: true,
      maxInlineOutputChars: null,
      maxSeq: 51,
      page: {
        kind: "older",
        beforeCursor: latest.timelinePage.olderCursor!,
        segmentLimit: 1,
      },
    }).response;
    const delegation = flattenRows(timeline.rows).find(
      (
        row,
      ): row is Extract<
        TimelineRow,
        { kind: "work"; workKind: "delegation" }
      > => row.kind === "work" && row.workKind === "delegation",
    );

    expect(delegation).toBeDefined();
    expect(delegation?.callId).toBe("toolu_agent_1");
    expect(rowTexts(delegation?.childRows ?? [])).toContain(
      "SECOND_SUBAGENT_OUTPUT",
    );
  });

  it("loads a subagent command's details by the subagent turn id and its own range", () => {
    const { db, thread } = setup();
    const delegation = {
      type: "delegation",
      id: "spawn-1",
      childRef: "provider-child",
      label: "/root/child",
      background: false,
    };
    const command = {
      type: "commandExecution",
      id: "child-command",
      command: "echo CHILD_COMMAND_OUTPUT",
      cwd: "/tmp/test",
      approvalStatus: null,
      parentToolCallId: "spawn-1",
    };
    insertEvents(db, noopNotifier, [
      spawnRequestedEvent(thread),
      turnEvent(thread, 2, "turn/started", "parent-turn", { data: {} }),
      turnEvent(thread, 3, "turn/input/accepted", "parent-turn", {
        data: { clientRequestId: requestId(1) },
      }),
      turnEvent(thread, 4, "item/started", "parent-turn", {
        itemId: "spawn-1",
        itemKind: "delegation",
        data: { item: { ...delegation, status: "pending" } },
      }),
      turnEvent(thread, 5, "turn/started", "child-turn", {
        parentToolCallId: "spawn-1",
        data: { parentToolCallId: "spawn-1" },
      }),
      turnEvent(thread, 6, "item/started", "child-turn", {
        itemId: "child-command",
        itemKind: "commandExecution",
        parentToolCallId: "spawn-1",
        data: { item: { ...command, status: "pending" } },
      }),
      turnEvent(thread, 7, "item/completed", "child-turn", {
        itemId: "child-command",
        itemKind: "commandExecution",
        parentToolCallId: "spawn-1",
        data: {
          item: {
            ...command,
            status: "completed",
            exitCode: 0,
            aggregatedOutput: "CHILD_COMMAND_OUTPUT\n",
          },
        },
      }),
      turnEvent(thread, 8, "turn/completed", "child-turn", {
        data: { status: "completed" },
      }),
      turnEvent(thread, 9, "item/completed", "parent-turn", {
        itemId: "spawn-1",
        itemKind: "delegation",
        data: { item: { ...delegation, status: "completed" } },
      }),
      turnEvent(thread, 10, "turn/completed", "parent-turn", {
        data: { status: "completed" },
      }),
    ]);

    const details = buildTimelineTurnSummaryDetails(db, thread, {
      completedTurnDisplay: "collapse",
      deferContent: true,
      includeDiagnosticOperations: false,
      itemId: "child-command",
      sourceSeqEnd: 7,
      sourceSeqStart: 6,
      summarizeShellCommands: true,
      turnId: "child-turn",
    });

    expect(details.rows).toHaveLength(1);
    expect(details.rows[0]).toMatchObject({
      kind: "work",
      workKind: "command",
      callId: "child-command",
      turnId: "child-turn",
    });
  });

  it("loads a command two subagents deep by its own turn id, and a root command by the root turn id", () => {
    const { db, thread } = setup();
    const outer = {
      type: "delegation",
      id: "spawn-1",
      childRef: "provider-child",
      label: "/root/child",
      background: false,
    };
    const inner = {
      type: "delegation",
      id: "spawn-2",
      childRef: "provider-grandchild",
      label: "/root/child/grandchild",
      background: false,
      parentToolCallId: "spawn-1",
    };
    const command = (id: string, parentToolCallId: string | null) => ({
      type: "commandExecution",
      id,
      command: `echo ${id}`,
      cwd: "/tmp/test",
      approvalStatus: null,
      ...(parentToolCallId === null ? {} : { parentToolCallId }),
    });
    const completedCommand = (id: string, parentToolCallId: string | null) => ({
      item: {
        ...command(id, parentToolCallId),
        status: "completed",
        exitCode: 0,
        aggregatedOutput: `${id.toUpperCase()}_OUTPUT\n`,
      },
    });
    insertEvents(db, noopNotifier, [
      spawnRequestedEvent(thread),
      turnEvent(thread, 2, "turn/started", "parent-turn", { data: {} }),
      turnEvent(thread, 3, "turn/input/accepted", "parent-turn", {
        data: { clientRequestId: requestId(1) },
      }),
      turnEvent(thread, 4, "item/started", "parent-turn", {
        itemId: "root-command",
        itemKind: "commandExecution",
        data: { item: { ...command("root-command", null), status: "pending" } },
      }),
      turnEvent(thread, 5, "item/completed", "parent-turn", {
        itemId: "root-command",
        itemKind: "commandExecution",
        data: completedCommand("root-command", null),
      }),
      turnEvent(thread, 6, "item/started", "parent-turn", {
        itemId: "spawn-1",
        itemKind: "delegation",
        data: { item: { ...outer, status: "pending" } },
      }),
      turnEvent(thread, 7, "turn/started", "child-turn", {
        parentToolCallId: "spawn-1",
        data: { parentToolCallId: "spawn-1" },
      }),
      turnEvent(thread, 8, "item/started", "child-turn", {
        itemId: "spawn-2",
        itemKind: "delegation",
        parentToolCallId: "spawn-1",
        data: { item: { ...inner, status: "pending" } },
      }),
      turnEvent(thread, 9, "turn/started", "grandchild-turn", {
        parentToolCallId: "spawn-2",
        data: { parentToolCallId: "spawn-2" },
      }),
      turnEvent(thread, 10, "item/started", "grandchild-turn", {
        itemId: "grand-command",
        itemKind: "commandExecution",
        parentToolCallId: "spawn-2",
        data: {
          item: { ...command("grand-command", "spawn-2"), status: "pending" },
        },
      }),
      turnEvent(thread, 11, "item/completed", "grandchild-turn", {
        itemId: "grand-command",
        itemKind: "commandExecution",
        parentToolCallId: "spawn-2",
        data: completedCommand("grand-command", "spawn-2"),
      }),
      turnEvent(thread, 12, "turn/completed", "grandchild-turn", {
        data: { status: "completed" },
      }),
      turnEvent(thread, 13, "item/completed", "child-turn", {
        itemId: "spawn-2",
        itemKind: "delegation",
        parentToolCallId: "spawn-1",
        data: { item: { ...inner, status: "completed" } },
      }),
      turnEvent(thread, 14, "turn/completed", "child-turn", {
        data: { status: "completed" },
      }),
      turnEvent(thread, 15, "item/completed", "parent-turn", {
        itemId: "spawn-1",
        itemKind: "delegation",
        data: { item: { ...outer, status: "completed" } },
      }),
      turnEvent(thread, 16, "turn/completed", "parent-turn", {
        data: { status: "completed" },
      }),
    ]);
    const request = {
      completedTurnDisplay: "collapse",
      deferContent: false,
      includeDiagnosticOperations: false,
      summarizeShellCommands: true,
    } as const;

    const bySubagentTurn = buildTimelineTurnSummaryDetails(db, thread, {
      ...request,
      itemId: "grand-command",
      sourceSeqEnd: 11,
      sourceSeqStart: 10,
      turnId: "grandchild-turn",
    });
    const byRootTurn = buildTimelineTurnSummaryDetails(db, thread, {
      ...request,
      itemId: "grand-command",
      sourceSeqEnd: 15,
      sourceSeqStart: 6,
      turnId: "parent-turn",
    });
    const rootCommand = buildTimelineTurnSummaryDetails(db, thread, {
      ...request,
      itemId: "root-command",
      sourceSeqEnd: 5,
      sourceSeqStart: 4,
      turnId: "parent-turn",
    });

    expect(bySubagentTurn.rows).toHaveLength(1);
    expect(bySubagentTurn.rows[0]).toMatchObject({
      kind: "work",
      workKind: "command",
      callId: "grand-command",
      turnId: "grandchild-turn",
    });
    expect(JSON.stringify(bySubagentTurn.rows)).toContain(
      "GRAND-COMMAND_OUTPUT",
    );
    expect(bySubagentTurn.rows).toEqual(byRootTurn.rows);
    expect(rootCommand.rows).toHaveLength(1);
    expect(rootCommand.rows[0]).toMatchObject({
      kind: "work",
      workKind: "command",
      callId: "root-command",
      turnId: "parent-turn",
    });
    expect(JSON.stringify(rootCommand.rows)).toContain("ROOT-COMMAND_OUTPUT");
    expect(JSON.stringify(rootCommand.rows)).not.toContain(
      "GRAND-COMMAND_OUTPUT",
    );
  });
});
