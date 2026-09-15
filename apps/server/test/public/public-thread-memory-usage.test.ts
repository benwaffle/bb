import { threadListResponseSchema, threadResponseSchema } from "@bb/server-contract";
import { hostMemoryUsageSignalSchema } from "@bb/server-contract";
import { hostWithMemoryUsageSchema } from "@bb/domain";
import { describe, expect, it, vi } from "vitest";
import {
  onDaemonSocketClose,
  onDaemonSocketMessage,
} from "../../src/ws/daemon-protocol.js";
import { readJson } from "../helpers/json.js";
import { createMockHubSocket } from "../helpers/mock-hub-socket.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../helpers/seed.js";
import { withTestHarness } from "../helpers/test-app.js";

const MB = 1024 * 1024;

describe("thread and host memory usage", () => {
  it("surfaces daemon memory samples on threads and the host until the daemon disconnects", async () => {
    await withTestHarness(async (harness) => {
      const { host, session } = seedHostSession(harness.deps, {
        id: "host-memory",
      });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
        path: "/tmp/thread-memory-source",
      });
      const environment = seedEnvironment(harness.deps, {
        hostId: host.id,
        projectId: project.id,
        path: "/tmp/thread-memory-source",
      });
      const exact = seedThread(harness.deps, {
        environmentId: environment.id,
        projectId: project.id,
        status: "active",
      });
      const shared = seedThread(harness.deps, {
        environmentId: environment.id,
        projectId: project.id,
        status: "idle",
      });
      const idle = seedThread(harness.deps, {
        environmentId: environment.id,
        projectId: project.id,
      });
      const clientSocket = createMockHubSocket();
      harness.hub.subscribe(clientSocket, { kind: "thread-list" });
      const daemonSocket = { close: vi.fn(), send: vi.fn() };

      onDaemonSocketMessage(harness.deps, {
        hostId: host.id,
        sessionId: session.id,
        socket: daemonSocket,
        raw: JSON.stringify({
          type: "process-memory.sample",
          sampledAt: 1_700_000_000_000,
          processes: [
            {
              environmentId: environment.id,
              providerId: "codex",
              pid: 4242,
              rssBytes: 900 * MB,
              processCount: 10,
              threads: [
                {
                  threadId: exact.id,
                  pid: 4300,
                  rssBytes: 700 * MB,
                  processCount: 7,
                },
                {
                  threadId: shared.id,
                  pid: null,
                  rssBytes: null,
                  processCount: null,
                },
              ],
            },
          ],
        }),
      });
      expect(daemonSocket.close).not.toHaveBeenCalled();

      const signal = hostMemoryUsageSignalSchema.parse(
        JSON.parse(clientSocket.messages.at(-1)!),
      );
      expect(signal.hostId).toBe(host.id);
      expect(signal.host?.rssBytes).toBe(900 * MB);
      expect(signal.threads[exact.id]?.rssBytes).toBe(700 * MB);
      expect(signal.threads[shared.id]).toEqual({
        rssBytes: 200 * MB,
        processCount: 3,
        sharedThreadCount: 1,
        sampledAt: 1_700_000_000_000,
      });

      const listResponse = await harness.app.request(
        `/api/v1/threads?projectId=${project.id}`,
      );
      expect(listResponse.status).toBe(200);
      const list = threadListResponseSchema.parse(await readJson(listResponse));
      const byId = new Map(list.map((entry) => [entry.id, entry]));
      expect(byId.get(exact.id)?.memoryUsage).toEqual({
        rssBytes: 700 * MB,
        processCount: 7,
        sharedThreadCount: 1,
        sampledAt: 1_700_000_000_000,
      });
      expect(byId.get(shared.id)?.memoryUsage?.rssBytes).toBe(200 * MB);
      expect(byId.get(idle.id)?.memoryUsage).toBeNull();

      const detailResponse = await harness.app.request(
        `/api/v1/threads/${exact.id}`,
      );
      expect(detailResponse.status).toBe(200);
      expect(
        threadResponseSchema.parse(await readJson(detailResponse)).memoryUsage
          ?.rssBytes,
      ).toBe(700 * MB);

      const hostResponse = await harness.app.request(`/api/v1/hosts/${host.id}`);
      expect(hostResponse.status).toBe(200);
      expect(
        hostWithMemoryUsageSchema.parse(await readJson(hostResponse))
          .memoryUsage,
      ).toEqual({
        rssBytes: 900 * MB,
        processCount: 10,
        sampledAt: 1_700_000_000_000,
      });

      const messagesBeforeClose = clientSocket.messages.length;
      onDaemonSocketClose(harness.deps, session.id);

      const memorySignals = clientSocket.messages
        .slice(messagesBeforeClose)
        .map((raw) => JSON.parse(raw) as { type: string })
        .filter((message) => message.type === "host-memory-usage");
      expect(memorySignals).toHaveLength(1);
      const cleared = hostMemoryUsageSignalSchema.parse(memorySignals[0]);
      expect(cleared).toEqual({
        type: "host-memory-usage",
        hostId: host.id,
        host: null,
        threads: {},
      });
      const afterClose = threadResponseSchema.parse(
        await readJson(await harness.app.request(`/api/v1/threads/${exact.id}`)),
      );
      expect(afterClose.memoryUsage).toBeNull();
      const hostAfterClose = hostWithMemoryUsageSchema.parse(
        await readJson(await harness.app.request(`/api/v1/hosts/${host.id}`)),
      );
      expect(hostAfterClose.memoryUsage).toBeNull();
    });
  });
});
