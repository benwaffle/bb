import { describe, expect, it } from "vitest";
import type { ThreadEvent } from "@get-bb/plugin-sdk/provider-bridge/testing";
import {
  TURN_1,
  createClaudeDeltaHarness,
  spawningToolUseMessage,
  threadScope,
  turnScope,
} from "./delta-test-harness.js";

const THREAD = "bb-thread-1";
const CONTEXT = { threadId: THREAD };
const TOOL_USE_ID = "toolu_bg_agent";
const TASK_ID = "agent-task-1";
const backgroundSubagentLabel = {
  pending: "Running background subagent",
  completed: "Background subagent finished",
};

function sdkMessage(message: Record<string, unknown>) {
  return {
    jsonrpc: "2.0",
    method: "sdk/message",
    params: { threadId: THREAD, message },
  };
}

function launchBackgroundAgent(options: {
  runInBackground: boolean;
  toolUseResult?: Record<string, unknown>;
}) {
  const harness = createClaudeDeltaHarness();
  harness.translate(
    {
      type: "assistant",
      message: {
        role: "assistant",
        content: [{ type: "text", text: "Starting a background survey." }],
      },
      session_id: "sess-1",
    },
    CONTEXT,
  );
  const opened = harness.translate(
    spawningToolUseMessage({
      toolUseId: TOOL_USE_ID,
      toolName: "Agent",
      input: {
        description: "Survey the build",
        prompt: "Map the build pipeline",
        subagent_type: "Explore",
        ...(options.runInBackground ? { run_in_background: true } : {}),
      },
    }),
    CONTEXT,
  );
  harness.translate(
    {
      type: "system",
      subtype: "task_started",
      task_id: TASK_ID,
      tool_use_id: TOOL_USE_ID,
      description: "Survey the build",
      subagent_type: "Explore",
      task_type: "local_agent",
      is_backgrounded: true,
      uuid: "u-task-started",
      session_id: "sess-1",
    },
    CONTEXT,
  );
  const launched = harness.translate(
    {
      type: "user",
      message: {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: TOOL_USE_ID,
            content: [
              {
                type: "text",
                text: `Async agent launched successfully.\nagentId: ${TASK_ID} (internal)`,
              },
            ],
          },
        ],
      },
      ...(options.toolUseResult === undefined
        ? {}
        : { tool_use_result: options.toolUseResult }),
      session_id: "sess-1",
    },
    CONTEXT,
  );
  return { harness, opened, launched };
}

function subagentReply(text: string) {
  return sdkMessage({
    type: "assistant",
    parent_tool_use_id: TOOL_USE_ID,
    message: { role: "assistant", content: [{ type: "text", text }] },
    session_id: "sess-1",
  });
}

function taskNotification(status: string) {
  return {
    type: "system",
    subtype: "task_notification",
    task_id: TASK_ID,
    tool_use_id: TOOL_USE_ID,
    status,
    output_file: `/tmp/tasks/${TASK_ID}.output`,
    summary: 'Agent "Survey the build" finished',
    usage: { total_tokens: 1200, tool_uses: 3, duration_ms: 4000 },
    uuid: `u-notification-${status}`,
    session_id: "sess-1",
  };
}

function delegationEvents(events: readonly ThreadEvent[]): ThreadEvent[] {
  return events.filter(
    (event) =>
      (event.type === "item/started" ||
        event.type === "item/completed" ||
        event.type === "item/delegation/progress" ||
        event.type === "item/delegation/completed") &&
      event.item.type === "delegation",
  );
}

describe("background Claude subagent delegations", () => {
  it("stays pending after the async launch reply while its children stream", () => {
    const { harness, launched } = launchBackgroundAgent({
      runInBackground: true,
      toolUseResult: { isAsync: true, status: "async_launched" },
    });
    expect(delegationEvents(launched)).toEqual([]);

    const child = harness.translate(
      subagentReply("Reading turbo.json now."),
      CONTEXT,
    );
    expect(child).toContainEqual(
      expect.objectContaining({
        type: "item/completed",
        scope: turnScope(TURN_1),
        item: expect.objectContaining({
          type: "agentMessage",
          parentToolCallId: harness.itemId(TOOL_USE_ID, THREAD),
        }),
      }),
    );
    expect(delegationEvents(child)).toEqual([]);
  });

  it("settles from the background task's completion with the subagent's final reply", () => {
    const { harness } = launchBackgroundAgent({ runInBackground: true });
    harness.translate(subagentReply("Reading turbo.json now."), CONTEXT);
    harness.translate(
      subagentReply("The pipeline is turbo build then electron-builder."),
      CONTEXT,
    );

    const settled = harness.translate(taskNotification("completed"), CONTEXT);

    expect(delegationEvents(settled)).toEqual([
      expect.objectContaining({
        type: "item/delegation/completed",
        scope: threadScope(),
        item: expect.objectContaining({
          id: harness.itemId(TOOL_USE_ID, THREAD),
          status: "completed",
          background: true,
          summary: "The pipeline is turbo build then electron-builder.",
          presentation: expect.objectContaining({
            label: {
              pending: "Running background subagent",
              completed: "Background subagent finished",
            },
          }),
        }),
      }),
    ]);
    expect(
      settled.findIndex(
        (event) => event.type === "item/backgroundTask/completed",
      ),
    ).toBeLessThan(
      settled.findIndex((event) => event.type === "item/delegation/completed"),
    );
  });

  it.each([
    ["failed", "failed"],
    ["stopped", "interrupted"],
  ])(
    "maps a %s background task to a %s delegation",
    (taskStatus, delegationStatus) => {
      const { harness } = launchBackgroundAgent({ runInBackground: true });

      const settled = harness.translate(taskNotification(taskStatus), CONTEXT);

      expect(delegationEvents(settled)).toEqual([
        expect.objectContaining({
          type: "item/delegation/completed",
          item: expect.objectContaining({
            status: delegationStatus,
            summary: 'Agent "Survey the build" finished',
          }),
        }),
      ]);
    },
  );

  it("treats an async launch reply as background even without run_in_background", () => {
    const { harness, opened, launched } = launchBackgroundAgent({
      runInBackground: false,
      toolUseResult: { isAsync: true, status: "async_launched" },
    });
    expect(delegationEvents(opened)).toEqual([
      expect.objectContaining({
        type: "item/started",
        item: expect.objectContaining({ background: false }),
      }),
    ]);
    expect(delegationEvents(launched)).toEqual([
      expect.objectContaining({
        type: "item/started",
        scope: turnScope(TURN_1),
        item: expect.objectContaining({
          id: harness.itemId(TOOL_USE_ID, THREAD),
          status: "pending",
          background: true,
          presentation: expect.objectContaining({
            label: backgroundSubagentLabel,
          }),
        }),
      }),
      expect.objectContaining({
        type: "item/delegation/progress",
        scope: threadScope(),
        item: expect.objectContaining({
          id: harness.itemId(TOOL_USE_ID, THREAD),
          status: "pending",
          background: true,
          presentation: expect.objectContaining({
            label: backgroundSubagentLabel,
          }),
        }),
      }),
    ]);

    const settled = harness.translate(taskNotification("completed"), CONTEXT);
    expect(delegationEvents(settled)).toEqual([
      expect.objectContaining({
        type: "item/delegation/completed",
        scope: threadScope(),
        item: expect.objectContaining({
          status: "completed",
          background: true,
          presentation: expect.objectContaining({
            label: backgroundSubagentLabel,
          }),
        }),
      }),
    ]);
  });

  it("stays pending when the turn ends before the background agent does", () => {
    const { harness } = launchBackgroundAgent({ runInBackground: true });
    const held = harness.translate(
      { type: "result", subtype: "success", session_id: "sess-1" },
      CONTEXT,
    );
    expect(held).toContainEqual(
      expect.objectContaining({ type: "turn/mainRun/updated", state: "idle" }),
    );
    const failedTurn = harness.translate(
      {
        type: "result",
        subtype: "error_during_execution",
        is_error: true,
        session_id: "sess-1",
      },
      CONTEXT,
    );
    expect(failedTurn).toContainEqual(
      expect.objectContaining({ type: "turn/completed", status: "failed" }),
    );
    expect(delegationEvents([...held, ...failedTurn])).toEqual([]);

    const settled = harness.translate(taskNotification("completed"), CONTEXT);
    expect(delegationEvents(settled)).toEqual([
      expect.objectContaining({
        type: "item/delegation/completed",
        scope: threadScope(),
        item: expect.objectContaining({ status: "completed" }),
      }),
    ]);
  });

  it("interrupts a running background delegation when the session is settled", () => {
    const { harness } = launchBackgroundAgent({ runInBackground: false });

    const settled = harness.settleSession(THREAD);

    expect(delegationEvents(settled)).toEqual([
      expect.objectContaining({
        type: "item/delegation/completed",
        scope: threadScope(),
        item: expect.objectContaining({
          status: "interrupted",
          background: true,
        }),
      }),
    ]);
    expect(
      settled.findIndex((event) => event.type === "item/delegation/completed"),
    ).toBeLessThan(
      settled.findIndex((event) => event.type === "turn/completed"),
    );
    expect(harness.settleSession(THREAD)).not.toContainEqual(
      expect.objectContaining({ type: "item/delegation/completed" }),
    );
  });

  it("settles a background delegation when the SDK stream ends", () => {
    const { harness } = launchBackgroundAgent({ runInBackground: true });

    const deltas =
      harness.translator.buildBackgroundTaskSettlementDeltas(THREAD);

    expect(deltas).toContainEqual(
      expect.objectContaining({
        kind: "item.close",
        key: { providerItemId: TOOL_USE_ID },
        status: "interrupted",
        item: expect.objectContaining({ type: "delegation", background: true }),
      }),
    );
  });

  it("closes once from the launch reply when the task finished before the reply arrived", () => {
    const harness = createClaudeDeltaHarness();
    harness.translate(
      spawningToolUseMessage({
        toolUseId: TOOL_USE_ID,
        toolName: "Agent",
        input: {
          description: "Survey the build",
          prompt: "Map the build pipeline",
          run_in_background: true,
        },
      }),
      CONTEXT,
    );
    harness.translate(
      {
        type: "system",
        subtype: "task_started",
        task_id: TASK_ID,
        tool_use_id: TOOL_USE_ID,
        description: "Survey the build",
        task_type: "local_agent",
        is_backgrounded: true,
        session_id: "sess-1",
      },
      CONTEXT,
    );
    const early = harness.translate(taskNotification("completed"), CONTEXT);
    expect(delegationEvents(early)).toEqual([]);

    const launched = harness.translate(
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: TOOL_USE_ID,
              content: [
                { type: "text", text: "Async agent launched successfully." },
              ],
            },
          ],
        },
        tool_use_result: { isAsync: true, status: "async_launched" },
        session_id: "sess-1",
      },
      CONTEXT,
    );

    expect(delegationEvents(launched)).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({
          id: harness.itemId(TOOL_USE_ID, THREAD),
          status: "completed",
          background: true,
        }),
      }),
    ]);
    expect(delegationEvents(harness.settleSession(THREAD))).toEqual([]);
  });

  it("closes a delegation once when its task completion is delivered twice", () => {
    const { harness } = launchBackgroundAgent({ runInBackground: true });

    const first = harness.translate(taskNotification("completed"), CONTEXT);
    const second = harness.translate(taskNotification("completed"), CONTEXT);

    expect(delegationEvents(first)).toHaveLength(1);
    expect(delegationEvents(second)).toEqual([]);
    expect(delegationEvents(harness.settleSession(THREAD))).toEqual([]);
  });

  it("settles concurrent background agents from their own task completions", () => {
    const { harness } = launchBackgroundAgent({ runInBackground: true });
    const otherToolUseId = "toolu_bg_agent_2";
    const otherTaskId = "agent-task-2";
    harness.translate(
      spawningToolUseMessage({
        toolUseId: otherToolUseId,
        toolName: "Agent",
        input: {
          description: "Audit the tests",
          prompt: "List slow tests",
          run_in_background: true,
        },
      }),
      CONTEXT,
    );
    harness.translate(
      {
        type: "system",
        subtype: "task_started",
        task_id: otherTaskId,
        tool_use_id: otherToolUseId,
        description: "Audit the tests",
        task_type: "local_agent",
        is_backgrounded: true,
        session_id: "sess-1",
      },
      CONTEXT,
    );
    harness.translate(
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: otherToolUseId,
              content: [
                { type: "text", text: "Async agent launched successfully." },
              ],
            },
          ],
        },
        tool_use_result: { isAsync: true, status: "async_launched" },
        session_id: "sess-1",
      },
      CONTEXT,
    );

    const otherSettled = harness.translate(
      {
        ...taskNotification("completed"),
        task_id: otherTaskId,
        tool_use_id: otherToolUseId,
      },
      CONTEXT,
    );
    expect(delegationEvents(otherSettled)).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({
          id: harness.itemId(otherToolUseId, THREAD),
          status: "completed",
        }),
      }),
    ]);

    const settled = harness.translate(taskNotification("failed"), CONTEXT);
    expect(delegationEvents(settled)).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({
          id: harness.itemId(TOOL_USE_ID, THREAD),
          status: "failed",
        }),
      }),
    ]);
  });

  it("completes the delegation on the launch reply when no background task was tracked", () => {
    const harness = createClaudeDeltaHarness();
    harness.translate(
      spawningToolUseMessage({
        toolUseId: TOOL_USE_ID,
        toolName: "Agent",
        input: {
          description: "Survey the build",
          prompt: "Map the build pipeline",
          run_in_background: true,
        },
      }),
      CONTEXT,
    );

    const launched = harness.translate(
      {
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: TOOL_USE_ID,
              content: [
                { type: "text", text: "Async agent launched successfully." },
              ],
            },
          ],
        },
        tool_use_result: { isAsync: true, status: "async_launched" },
        session_id: "sess-1",
      },
      CONTEXT,
    );

    expect(delegationEvents(launched)).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({
          status: "completed",
          presentation: expect.objectContaining({
            label: {
              pending: "Launching subagent",
              completed: "Launched subagent",
            },
          }),
        }),
      }),
    ]);
  });

  it("ignores a completion for a delegation a resumed session never launched", () => {
    const harness = createClaudeDeltaHarness();
    harness.translate(
      {
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Resumed." }],
        },
        session_id: "sess-1",
      },
      CONTEXT,
    );

    const events = harness.translate(taskNotification("completed"), CONTEXT);

    expect(delegationEvents(events)).toEqual([]);
  });
});
