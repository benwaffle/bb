import { deleteThread, getThread, listEvents, markThreadDeleted } from "@bb/db";
import {
  turnRequestEventDataSchema,
  turnScope,
  type ThreadEvent,
} from "@bb/domain";
import {
  threadProviderSessionsResponseSchema,
  threadResponseSchema,
} from "@bb/server-contract";
import { describe, expect, it } from "vitest";
import { waitForQueuedCommand } from "../helpers/commands.js";
import { readJson } from "../helpers/json.js";
import { minimalProviderRegistration } from "../helpers/provider-registry.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedTurnStarted,
} from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

const SOURCE_PATH = "/tmp/public-thread-import";
const SOURCE_SESSION_ID = "claude-session-source";
const PLACEHOLDER_THREAD_ID = "placeholder-thread";

function seedImportTarget(harness: TestAppHarness) {
  const { host } = seedHostSession(harness.deps);
  const { project } = seedProjectWithSource(harness.deps, {
    hostId: host.id,
    path: SOURCE_PATH,
  });
  const environment = seedEnvironment(harness.deps, {
    hostId: host.id,
    projectId: project.id,
    path: SOURCE_PATH,
  });
  return { environment, host, project };
}

function importedTurn(args: {
  at: number;
  prompt: string;
  reply: string;
  turnId: string;
  checkpointId?: string;
}) {
  const scope = turnScope(args.turnId);
  const events: ThreadEvent[] = [
    {
      type: "turn/started",
      threadId: PLACEHOLDER_THREAD_ID,
      providerThreadId: SOURCE_SESSION_ID,
      scope,
    },
    {
      type: "turn/input/accepted",
      threadId: PLACEHOLDER_THREAD_ID,
      providerThreadId: SOURCE_SESSION_ID,
      clientRequestId: "creq_2222222222",
      scope,
    },
    {
      type: "item/started",
      threadId: PLACEHOLDER_THREAD_ID,
      providerThreadId: SOURCE_SESSION_ID,
      scope,
      item: { type: "agentMessage", id: `${args.turnId}-msg`, text: "" },
    },
    {
      type: "item/completed",
      threadId: PLACEHOLDER_THREAD_ID,
      providerThreadId: SOURCE_SESSION_ID,
      scope,
      item: {
        type: "agentMessage",
        id: `${args.turnId}-msg`,
        text: args.reply,
      },
    },
    {
      type: "turn/completed",
      threadId: PLACEHOLDER_THREAD_ID,
      providerThreadId: SOURCE_SESSION_ID,
      scope,
      status: "completed",
      ...(args.checkpointId === undefined
        ? {}
        : { providerCheckpointId: args.checkpointId }),
    },
  ];
  return {
    at: args.at,
    input: [{ type: "text", text: args.prompt, mentions: [] }],
    events: events.map((event, index) => ({
      at: args.at + index,
      event,
    })),
  };
}

async function postImport(
  harness: TestAppHarness,
  body: Record<string, unknown>,
) {
  return harness.app.request("/api/v1/threads/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/threads/import", () => {
  it("records the imported turns and forks the source session on the first message", async () => {
    await withTestHarness(async (harness) => {
      const { environment, project } = seedImportTarget(harness);
      const response = await postImport(harness, {
        projectId: project.id,
        providerId: "codex",
        environment: { type: "reuse", environmentId: environment.id },
        sourceProviderThreadId: SOURCE_SESSION_ID,
        title: "Imported session",
        turns: [
          importedTurn({
            at: 1_000,
            prompt: "add search to settings",
            reply: "Done: settings now has a search box.",
            turnId: "turn-1",
          }),
          importedTurn({
            at: 2_000,
            prompt: "now make it fuzzy",
            reply: "Fuzzy matching is in.",
            turnId: "turn-2",
          }),
        ],
      });
      expect(response.status).toBe(201);
      const thread = threadResponseSchema.parse(await readJson(response));
      expect(thread.title).toBe("Imported session");
      expect(getThread(harness.db, thread.id)?.status).toBe("pending");
      expect(getThread(harness.db, thread.id)?.environmentId).toBe(
        environment.id,
      );

      const events = listEvents(harness.db, { threadId: thread.id });
      expect(events.map((event) => event.type)).toEqual([
        "client/turn/requested",
        "turn/started",
        "turn/input/accepted",
        "item/completed",
        "turn/completed",
        "client/turn/requested",
        "turn/started",
        "turn/input/accepted",
        "item/completed",
        "turn/completed",
      ]);
      expect(events.map((event) => event.createdAt)).toEqual([
        1_000, 1_000, 1_001, 1_003, 1_004, 2_000, 2_000, 2_001, 2_003, 2_004,
      ]);
      expect(events.every((event) => event.providerThreadId === null)).toBe(
        true,
      );
      const firstRequest = turnRequestEventDataSchema.parse(
        JSON.parse(events[0]?.data ?? "{}"),
      );
      expect(firstRequest.input).toEqual([
        { type: "text", text: "add search to settings", mentions: [] },
      ]);
      expect(firstRequest.initiator).toBe("user");
      const firstAccepted = JSON.parse(events[2]?.data ?? "{}") as {
        clientRequestId: string;
      };
      expect(firstAccepted.clientRequestId).toBe(firstRequest.requestId);
      expect(events[1]?.turnId).toBe("turn-1");

      const send = await harness.app.request(
        `/api/v1/threads/${thread.id}/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "start",
            input: [{ type: "text", text: "and dark mode?", mentions: [] }],
          }),
        },
      );
      expect(send.status).toBe(200);
      const start = await waitForQueuedCommand(
        harness,
        ({ command }) =>
          command.type === "thread.start" && command.threadId === thread.id,
      );
      if (start.command.type !== "thread.start") {
        throw new Error("Expected thread.start");
      }
      expect(start.command.fork).toEqual({
        sourceProviderThreadId: SOURCE_SESSION_ID,
      });
      expect(start.command.input).toEqual([
        { type: "text", text: "and dark mode?", mentions: [] },
      ]);
    });
  });

  it("pins the fork to the last imported turn's provider checkpoint", async () => {
    await withTestHarness(async (harness) => {
      const { environment, project } = seedImportTarget(harness);
      const response = await postImport(harness, {
        projectId: project.id,
        providerId: "codex",
        environment: { type: "reuse", environmentId: environment.id },
        sourceProviderThreadId: SOURCE_SESSION_ID,
        turns: [
          importedTurn({
            at: 1_000,
            prompt: "first",
            reply: "one",
            turnId: "turn-1",
            checkpointId: "uuid-turn-1",
          }),
          importedTurn({
            at: 2_000,
            prompt: "second",
            reply: "two",
            turnId: "turn-2",
            checkpointId: "uuid-turn-2",
          }),
        ],
      });
      expect(response.status).toBe(201);
      const thread = threadResponseSchema.parse(await readJson(response));
      const send = await harness.app.request(
        `/api/v1/threads/${thread.id}/send`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "start",
            input: [{ type: "text", text: "third", mentions: [] }],
          }),
        },
      );
      expect(send.status).toBe(200);
      const start = await waitForQueuedCommand(
        harness,
        ({ command }) =>
          command.type === "thread.start" && command.threadId === thread.id,
      );
      if (start.command.type !== "thread.start") {
        throw new Error("Expected thread.start");
      }
      expect(start.command.fork).toEqual({
        sourceProviderThreadId: SOURCE_SESSION_ID,
        sourceProviderCheckpointId: "uuid-turn-2",
      });
    });
  });

  it("falls back to the first prompt as the title", async () => {
    await withTestHarness(async (harness) => {
      const { environment, project } = seedImportTarget(harness);
      const response = await postImport(harness, {
        projectId: project.id,
        providerId: "codex",
        environment: { type: "reuse", environmentId: environment.id },
        sourceProviderThreadId: SOURCE_SESSION_ID,
        turns: [
          importedTurn({
            at: 1_000,
            prompt: "rename the widget",
            reply: "Renamed.",
            turnId: "turn-1",
          }),
        ],
      });
      expect(response.status).toBe(201);
      const thread = threadResponseSchema.parse(await readJson(response));
      expect(thread.title).toBeNull();
      expect(thread.titleFallback).toBe("rename the widget");
    });
  });

  it("rejects turn events that precede their turn start", async () => {
    await withTestHarness(async (harness) => {
      const { environment, project } = seedImportTarget(harness);
      const turn = importedTurn({
        at: 1_000,
        prompt: "hello",
        reply: "hi",
        turnId: "turn-1",
      });
      const response = await postImport(harness, {
        projectId: project.id,
        providerId: "codex",
        environment: { type: "reuse", environmentId: environment.id },
        sourceProviderThreadId: SOURCE_SESSION_ID,
        turns: [{ ...turn, events: turn.events.slice(1) }],
      });
      expect(response.status).toBe(400);
      const body = (await readJson(response)) as { message?: string };
      expect(body.message).toContain("before its turn/started");
    });
  });

  it("rejects a provider that cannot fork sessions", async () => {
    await withTestHarness(async (harness) => {
      const { environment, project } = seedImportTarget(harness);
      const fake = harness.deps.providerRegistry.get("codex");
      if (fake === null) {
        throw new Error("Expected the codex provider to be registered");
      }
      harness.deps.providerRegistry.register(
        minimalProviderRegistration({
          pluginId: fake.pluginId,
          info: {
            ...fake.info,
            id: "no-fork",
            capabilities: { ...fake.info.capabilities, supportsFork: false },
          },
          serverCapabilities: { ...fake.serverCapabilities, fork: "none" },
        }),
      );
      const response = await postImport(harness, {
        projectId: project.id,
        providerId: "no-fork",
        environment: { type: "reuse", environmentId: environment.id },
        sourceProviderThreadId: SOURCE_SESSION_ID,
        turns: [
          importedTurn({
            at: 1_000,
            prompt: "hello",
            reply: "hi",
            turnId: "turn-1",
          }),
        ],
      });
      expect(response.status).toBe(400);
      const body = (await readJson(response)) as { message?: string };
      expect(body.message).toContain("thread forks");
    });
  });
});

describe("GET /api/v1/threads/provider-sessions", () => {
  async function providerSessions(harness: TestAppHarness, providerId: string) {
    const response = await harness.app.request(
      `/api/v1/threads/provider-sessions?providerId=${providerId}`,
    );
    expect(response.status).toBe(200);
    return threadProviderSessionsResponseSchema.parse(await readJson(response))
      .sessions;
  }

  async function importPendingThread(harness: TestAppHarness) {
    const { environment, project } = seedImportTarget(harness);
    const response = await postImport(harness, {
      projectId: project.id,
      providerId: "codex",
      environment: { type: "reuse", environmentId: environment.id },
      sourceProviderThreadId: SOURCE_SESSION_ID,
      turns: [
        importedTurn({
          at: 1_000,
          prompt: "add search to settings",
          reply: "Done.",
          turnId: "turn-1",
        }),
      ],
    });
    expect(response.status).toBe(201);
    return {
      environment,
      thread: threadResponseSchema.parse(await readJson(response)),
    };
  }

  it("reports the source session of a pending import, and nothing for another provider", async () => {
    await withTestHarness(async (harness) => {
      const { thread } = await importPendingThread(harness);

      expect(await providerSessions(harness, "codex")).toEqual([
        { providerThreadId: SOURCE_SESSION_ID, threadId: thread.id },
      ]);
      expect(await providerSessions(harness, "claude-code")).toEqual([]);
    });
  });

  it("reports every session id the thread's turns ran under", async () => {
    await withTestHarness(async (harness) => {
      const { environment, thread } = await importPendingThread(harness);
      seedTurnStarted(harness.deps, {
        environmentId: environment.id,
        providerThreadId: "claude-session-resumed",
        threadId: thread.id,
        turnId: "turn-2",
      });

      const sessions = await providerSessions(harness, "codex");
      expect(sessions.map((entry) => entry.providerThreadId).sort()).toEqual([
        "claude-session-resumed",
        SOURCE_SESSION_ID,
      ]);
      expect(new Set(sessions.map((entry) => entry.threadId))).toEqual(
        new Set([thread.id]),
      );
    });
  });

  it("still reports a session whose thread was soft-deleted", async () => {
    await withTestHarness(async (harness) => {
      const { environment, thread } = await importPendingThread(harness);
      seedTurnStarted(harness.deps, {
        environmentId: environment.id,
        providerThreadId: "claude-session-worker",
        threadId: thread.id,
        turnId: "turn-2",
      });
      markThreadDeleted(harness.db, harness.deps.hub, { threadId: thread.id });

      const sessions = await providerSessions(harness, "codex");
      expect(sessions.map((entry) => entry.providerThreadId).sort()).toEqual([
        SOURCE_SESSION_ID,
        "claude-session-worker",
      ]);
    });
  });

  it("loses the session of a hard-deleted worker thread, which the plugin ledger covers", async () => {
    await withTestHarness(async (harness) => {
      const { environment, thread } = await importPendingThread(harness);
      seedTurnStarted(harness.deps, {
        environmentId: environment.id,
        providerThreadId: "claude-session-worker",
        threadId: thread.id,
        turnId: "turn-2",
      });
      expect(
        (await providerSessions(harness, "codex")).map(
          (entry) => entry.providerThreadId,
        ),
      ).toContain("claude-session-worker");

      deleteThread(harness.db, harness.deps.hub, thread.id);

      expect(await providerSessions(harness, "codex")).toEqual([]);
    });
  });
});
