import { describe, expect, it } from "vitest";
import type { HostDaemonProcessMemorySampleMessage } from "@bb/host-daemon-contract";
import {
  assembleHostMemoryUsage,
  HostMemoryUsageStore,
} from "../../../src/services/hosts/host-memory-usage.js";

const MB = 1024 * 1024;

function sample(
  processes: HostDaemonProcessMemorySampleMessage["processes"],
  sampledAt = 1_700_000_000_000,
): HostDaemonProcessMemorySampleMessage {
  return { type: "process-memory.sample", sampledAt, processes };
}

describe("assembleHostMemoryUsage", () => {
  it("attributes exact subtrees to their threads and the remainder to unattributed threads", () => {
    const snapshot = assembleHostMemoryUsage(
      sample([
        {
          environmentId: "env-1",
          providerId: "claude-code",
          pid: 100,
          rssBytes: 1000 * MB,
          processCount: 12,
          threads: [
            { threadId: "thr-exact", pid: 101, rssBytes: 600 * MB, processCount: 8 },
            { threadId: "thr-shared-a", pid: null, rssBytes: null, processCount: null },
            { threadId: "thr-shared-b", pid: null, rssBytes: null, processCount: null },
          ],
        },
      ]),
    );
    expect(snapshot.host).toEqual({
      rssBytes: 1000 * MB,
      processCount: 12,
      sampledAt: 1_700_000_000_000,
    });
    expect(snapshot.threads.get("thr-exact")).toEqual({
      rssBytes: 600 * MB,
      processCount: 8,
      sharedThreadCount: 1,
      sampledAt: 1_700_000_000_000,
    });
    expect(snapshot.threads.get("thr-shared-a")).toEqual({
      rssBytes: 400 * MB,
      processCount: 4,
      sharedThreadCount: 2,
      sampledAt: 1_700_000_000_000,
    });
    expect(snapshot.threads.get("thr-shared-b")).toEqual(
      snapshot.threads.get("thr-shared-a"),
    );
  });

  it("gives a lone unattributed thread the whole bridge tree", () => {
    const snapshot = assembleHostMemoryUsage(
      sample([
        {
          environmentId: "env-1",
          providerId: "claude-code",
          pid: 100,
          rssBytes: 250 * MB,
          processCount: 3,
          threads: [
            { threadId: "thr-only", pid: null, rssBytes: null, processCount: null },
          ],
        },
      ]),
    );
    expect(snapshot.threads.get("thr-only")).toEqual({
      rssBytes: 250 * MB,
      processCount: 3,
      sharedThreadCount: 1,
      sampledAt: 1_700_000_000_000,
    });
  });

  it("sums bridge trees into the host total and reports zero for an empty sample", () => {
    const snapshot = assembleHostMemoryUsage(
      sample([
        {
          environmentId: "env-1",
          providerId: "a",
          pid: 1,
          rssBytes: 10 * MB,
          processCount: 1,
          threads: [],
        },
        {
          environmentId: "env-2",
          providerId: "b",
          pid: 2,
          rssBytes: 20 * MB,
          processCount: 2,
          threads: [],
        },
      ]),
    );
    expect(snapshot.host.rssBytes).toBe(30 * MB);
    expect(snapshot.host.processCount).toBe(3);
    expect(assembleHostMemoryUsage(sample([])).host).toEqual({
      rssBytes: 0,
      processCount: 0,
      sampledAt: 1_700_000_000_000,
    });
  });
});

describe("HostMemoryUsageStore", () => {
  const threadProcess = (
    threadId: string,
    rssBytes: number,
  ): HostDaemonProcessMemorySampleMessage["processes"][number] => ({
    environmentId: "env-1",
    providerId: "acp",
    pid: 100,
    rssBytes,
    processCount: 2,
    threads: [{ threadId, pid: 101, rssBytes, processCount: 2 }],
  });

  it("resolves thread usage by host and reports whether a sample changed anything", () => {
    const store = new HostMemoryUsageStore();
    expect(store.replace("host-1", sample([threadProcess("thr-1", 5 * MB)]))).toBe(
      true,
    );
    expect(store.getThreadMemoryUsage("thr-1")?.rssBytes).toBe(5 * MB);
    expect(store.getHostMemoryUsage("host-1")?.rssBytes).toBe(5 * MB);
    expect(
      store.replace(
        "host-1",
        sample([threadProcess("thr-1", 5 * MB)], 1_700_000_005_000),
      ),
    ).toBe(false);
    expect(store.getThreadMemoryUsage("thr-1")?.sampledAt).toBe(
      1_700_000_005_000,
    );
    expect(store.replace("host-1", sample([threadProcess("thr-1", 6 * MB)]))).toBe(
      true,
    );
  });

  it("forgets threads that left the latest sample and everything on a cleared host", () => {
    const store = new HostMemoryUsageStore();
    store.replace("host-1", sample([threadProcess("thr-1", 5 * MB)]));
    store.replace("host-1", sample([threadProcess("thr-2", 7 * MB)]));
    expect(store.getThreadMemoryUsage("thr-1")).toBeNull();
    expect(store.getThreadMemoryUsage("thr-2")?.rssBytes).toBe(7 * MB);
    expect(store.clear("host-1")).toBe(true);
    expect(store.clear("host-1")).toBe(false);
    expect(store.getThreadMemoryUsage("thr-2")).toBeNull();
    expect(store.getHostMemoryUsage("host-1")).toBeNull();
  });

  it("keeps a thread pointed at the host that last reported it", () => {
    const store = new HostMemoryUsageStore();
    store.replace("host-1", sample([threadProcess("thr-1", 5 * MB)]));
    store.replace("host-2", sample([threadProcess("thr-1", 9 * MB)]));
    expect(store.getThreadMemoryUsage("thr-1")?.rssBytes).toBe(9 * MB);
    store.clear("host-1");
    expect(store.getThreadMemoryUsage("thr-1")?.rssBytes).toBe(9 * MB);
  });
});
