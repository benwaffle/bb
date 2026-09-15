import { turnScope } from "@bb/domain";
import { describe, expect, it } from "vitest";
import { registerHostRpcResponder } from "../helpers/host-rpc.js";
import { readJson } from "../helpers/json.js";
import { seedStoredEvent, seedThreadFixture } from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

const TASK_ID = "b0i8hik1l";
const COMMAND = "for i in $(seq 1 100); do echo tick $i; sleep 1; done";

function seedRunningBackgroundCommand(harness: TestAppHarness) {
  const fixture = seedThreadFixture(harness, {
    thread: { providerId: "claude-code", status: "active" },
  });
  const itemId = `task:${TASK_ID}`;
  seedStoredEvent(harness.deps, {
    threadId: fixture.thread.id,
    environmentId: fixture.environment.id,
    sequence: 1,
    type: "turn/started",
    scope: turnScope("turn-1"),
    providerThreadId: "claude-session-1",
    data: { providerThreadId: "claude-session-1" },
  });
  seedStoredEvent(harness.deps, {
    threadId: fixture.thread.id,
    environmentId: fixture.environment.id,
    sequence: 2,
    type: "item/started",
    scope: turnScope("turn-1"),
    providerThreadId: "claude-session-1",
    itemId,
    itemKind: "backgroundTask",
    data: {
      providerThreadId: "claude-session-1",
      item: {
        id: itemId,
        type: "backgroundTask",
        familyId: TASK_ID,
        taskType: "local_bash",
        description: "Count ticks",
        command: COMMAND,
        status: "pending",
        taskStatus: "running",
        skipTranscript: false,
      },
    },
  });
  seedStoredEvent(harness.deps, {
    threadId: fixture.thread.id,
    environmentId: fixture.environment.id,
    sequence: 3,
    type: "turn/completed",
    scope: turnScope("turn-1"),
    providerThreadId: "claude-session-1",
    data: { providerThreadId: "claude-session-1", status: "completed" },
  });
  return fixture;
}

describe("thread background command routes", () => {
  it("lists a running background command with its task id and command line", async () => {
    await withTestHarness(async (harness) => {
      const fixture = seedRunningBackgroundCommand(harness);
      const response = await harness.app.request(
        `/api/v1/threads/${fixture.thread.id}/timeline?summaryOnly=true`,
      );
      expect(response.status).toBe(200);
      const body = await readJson(response);
      expect(body).toMatchObject({
        rows: [],
        activeBackgroundCommands: [
          {
            workKind: "workflow",
            familyId: TASK_ID,
            taskType: "local_bash",
            command: COMMAND,
            status: "pending",
          },
        ],
      });
    });
  });

  it("stops a running background command through the thread's host", async () => {
    await withTestHarness(async (harness) => {
      const fixture = seedRunningBackgroundCommand(harness);
      const responder = registerHostRpcResponder(harness, {
        hostId: fixture.host.id,
        sessionId: fixture.session.id,
        handle: ({ command }) => {
          expect(command).toMatchObject({
            type: "thread.backgroundTask.stop",
            threadId: fixture.thread.id,
            environmentId: fixture.environment.id,
            taskId: TASK_ID,
          });
          return { ok: true, result: { stopped: true } };
        },
      });

      const response = await harness.app.request(
        `/api/v1/threads/${fixture.thread.id}/background-commands/${TASK_ID}/stop`,
        { method: "POST" },
      );

      expect(
        response.status,
        JSON.stringify(await readJson(response.clone())),
      ).toBe(200);
      expect(await readJson(response)).toEqual({ ok: true, stopped: true });
      expect(responder.requests).toHaveLength(1);
    });
  });

  it("reports a conflict when the provider does not confirm the stop", async () => {
    await withTestHarness(async (harness) => {
      const fixture = seedRunningBackgroundCommand(harness);
      registerHostRpcResponder(harness, {
        hostId: fixture.host.id,
        sessionId: fixture.session.id,
        handle: () => ({ ok: true, result: { stopped: false } }),
      });

      const response = await harness.app.request(
        `/api/v1/threads/${fixture.thread.id}/background-commands/${TASK_ID}/stop`,
        { method: "POST" },
      );

      expect(response.status).toBe(409);
    });
  });

  it("explains when the agent session that owns the command is gone", async () => {
    await withTestHarness(async (harness) => {
      const fixture = seedRunningBackgroundCommand(harness);
      registerHostRpcResponder(harness, {
        hostId: fixture.host.id,
        sessionId: fixture.session.id,
        handle: () => ({
          ok: false,
          errorCode: "unknown_thread_runtime",
          errorMessage: "No provider runtime available",
        }),
      });

      const response = await harness.app.request(
        `/api/v1/threads/${fixture.thread.id}/background-commands/${TASK_ID}/stop`,
        { method: "POST" },
      );

      expect(response.status).toBe(409);
      expect(await readJson(response)).toMatchObject({
        message: expect.stringContaining("no longer loaded"),
      });
    });
  });

  it("returns 404 for a task id that is not a running background command", async () => {
    await withTestHarness(async (harness) => {
      const fixture = seedRunningBackgroundCommand(harness);
      const responder = registerHostRpcResponder(harness, {
        hostId: fixture.host.id,
        sessionId: fixture.session.id,
        handle: () => ({ ok: true, result: { stopped: true } }),
      });

      const response = await harness.app.request(
        `/api/v1/threads/${fixture.thread.id}/background-commands/unknown-task/stop`,
        { method: "POST" },
      );

      expect(response.status).toBe(404);
      expect(responder.requests).toHaveLength(0);
    });
  });
});
