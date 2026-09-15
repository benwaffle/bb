import { threadScope } from "@bb/domain";
import {
  groupHostDaemonEvents,
  type HostDaemonEventEnvelope,
} from "@bb/host-daemon-contract";
import { describe, expect, it } from "vitest";
import { internalAuthHeaders } from "../helpers/commands.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../helpers/seed.js";
import { createTestAppHarness } from "../helpers/test-app.js";
import type { TestAppHarness } from "../helpers/test-app.js";
import { getRememberedProviderSessionCommands } from "../../src/services/threads/provider-session-commands-store.js";

const SESSION_COMMANDS_KIND = "provider-claude-code/session-commands";

async function setup(providerId: string) {
  const harness = await createTestAppHarness();
  const { host, session } = seedHostSession(harness.deps);
  const { project } = seedProjectWithSource(harness.deps, { hostId: host.id });
  const environment = seedEnvironment(harness.deps, {
    hostId: host.id,
    projectId: project.id,
  });
  const thread = seedThread(harness.deps, {
    projectId: project.id,
    environmentId: environment.id,
    providerId,
    status: "active",
  });
  return { harness, host, session, thread };
}

async function post(
  harness: TestAppHarness,
  sessionId: string,
  batch: HostDaemonEventEnvelope[],
): Promise<Response> {
  return harness.app.request("/internal/session/events", {
    method: "POST",
    headers: internalAuthHeaders(harness),
    body: JSON.stringify({
      sessionId,
      eventGroups: groupHostDaemonEvents(batch),
    }),
  });
}

function sessionCommandsEvent(
  threadId: string,
  names: readonly string[],
): HostDaemonEventEnvelope {
  return {
    threadId,
    event: {
      type: "thread/extensionState/updated",
      threadId,
      providerThreadId: "claude-session",
      scope: threadScope(),
      kind: SESSION_COMMANDS_KIND,
      payload: {
        commands: names.map((name) => ({
          name,
          description: `${name} description`,
          argumentHint: null,
          aliases: [],
        })),
      },
    },
  };
}

describe("published session commands are remembered per machine", () => {
  it("stores the list on ingest and lets a later publish replace it", async () => {
    const { harness, host, session, thread } = await setup("claude-code");
    try {
      const first = await post(harness, session.id, [
        sessionCommandsEvent(thread.id, ["code-review", "loop"]),
      ]);
      expect(first.status).toBe(200);
      expect(
        getRememberedProviderSessionCommands(harness.deps.config.dataDir, {
          hostId: host.id,
          providerId: "claude-code",
        }),
      ).toMatchObject({
        kind: SESSION_COMMANDS_KIND,
        state: {
          commands: [{ name: "code-review" }, { name: "loop" }],
        },
      });

      const second = await post(harness, session.id, [
        sessionCommandsEvent(thread.id, ["simplify"]),
      ]);
      expect(second.status).toBe(200);
      expect(
        getRememberedProviderSessionCommands(harness.deps.config.dataDir, {
          hostId: host.id,
          providerId: "claude-code",
        })?.state.commands.map((command) => command.name),
      ).toEqual(["simplify"]);
    } finally {
      await harness.cleanup();
    }
  });

  it("ignores extension state of a thread whose provider declares no session commands kind", async () => {
    const { harness, host, session, thread } = await setup("codex");
    try {
      const response = await post(harness, session.id, [
        sessionCommandsEvent(thread.id, ["code-review"]),
      ]);
      expect(response.status).toBe(200);
      expect(
        getRememberedProviderSessionCommands(harness.deps.config.dataDir, {
          hostId: host.id,
          providerId: "codex",
        }),
      ).toBeNull();
      expect(
        getRememberedProviderSessionCommands(harness.deps.config.dataDir, {
          hostId: host.id,
          providerId: "claude-code",
        }),
      ).toBeNull();
    } finally {
      await harness.cleanup();
    }
  });
});
