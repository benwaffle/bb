import { describe, expect, it, vi } from "vitest";
import type { HostDaemonDaemonWsMessage } from "@bb/host-daemon-contract";
import { parseProcessMemoryTable } from "@bb/process-utils";
import {
  buildProcessMemorySamples,
  startProcessMemoryMonitor,
} from "./process-memory-monitor.js";
import type { RuntimeManagerProviderProcess } from "./runtime-manager.js";

const KB = 1024;

const table = parseProcessMemoryTable(
  [
    "1 0 1 100",
    "100 1 100 1000",
    "101 100 100 2000",
    "102 101 100 3000",
    "200 1 200 4000",
    "201 200 200 5000",
  ].join("\n"),
);

const sharedBridge: RuntimeManagerProviderProcess = {
  environmentId: "env-1",
  providerId: "claude-code",
  pid: 100,
  threads: [
    { threadId: "thr-a", pid: 101 },
    { threadId: "thr-b", pid: null },
  ],
};

describe("buildProcessMemorySamples", () => {
  it("reports the bridge tree and each thread subtree it knows a pid for", () => {
    const samples = buildProcessMemorySamples([sharedBridge], table);
    expect(samples).toEqual([
      {
        environmentId: "env-1",
        providerId: "claude-code",
        pid: 100,
        rssBytes: (1000 + 2000 + 3000) * KB,
        processCount: 3,
        threads: [
          {
            threadId: "thr-a",
            pid: 101,
            rssBytes: (2000 + 3000) * KB,
            processCount: 2,
          },
          { threadId: "thr-b", pid: null, rssBytes: null, processCount: null },
        ],
      },
    ]);
  });

  it("drops bridges whose process is no longer in the table", () => {
    const samples = buildProcessMemorySamples(
      [{ ...sharedBridge, pid: 999 }],
      table,
    );
    expect(samples).toEqual([]);
  });

  it("reports a thread pid that has exited as unattributed", () => {
    const samples = buildProcessMemorySamples(
      [
        {
          environmentId: "env-2",
          providerId: "acp",
          pid: 200,
          threads: [{ threadId: "thr-c", pid: 555 }],
        },
      ],
      table,
    );
    expect(samples[0]?.threads).toEqual([
      { threadId: "thr-c", pid: 555, rssBytes: null, processCount: null },
    ]);
  });

  it("ignores a recorded thread pid that now belongs to a process outside the bridge tree", () => {
    const samples = buildProcessMemorySamples(
      [
        {
          environmentId: "env-2",
          providerId: "acp",
          pid: 200,
          threads: [{ threadId: "thr-c", pid: 101 }],
        },
      ],
      table,
    );
    expect(samples[0]?.threads).toEqual([
      { threadId: "thr-c", pid: 101, rssBytes: null, processCount: null },
    ]);
  });
});

describe("startProcessMemoryMonitor", () => {
  function createHarness(processes: () => RuntimeManagerProviderProcess[]) {
    const sent: HostDaemonDaemonWsMessage[] = [];
    let tick: () => void = () => undefined;
    let cleared = false;
    const readProcessTable = vi.fn(async () => table);
    const monitor = startProcessMemoryMonitor({
      logger: { warn: vi.fn() },
      listProviderProcesses: processes,
      sendMessage: (message) => {
        sent.push(message);
        return true;
      },
      nowMs: () => 1_700_000_000_000,
      readProcessTable,
      setIntervalFn: (callback) => {
        tick = callback;
        return {
          clear: () => {
            cleared = true;
          },
          unref: () => undefined,
        };
      },
    });
    return {
      monitor,
      readProcessTable,
      sent,
      tick: () => tick(),
      isCleared: () => cleared,
    };
  }

  it("does not read the process table while no provider processes exist", async () => {
    const harness = createHarness(() => []);
    await harness.monitor.sampleOnce();
    expect(harness.readProcessTable).not.toHaveBeenCalled();
    expect(harness.sent).toEqual([]);
  });

  it("sends samples while processes run and one empty sample after they stop", async () => {
    let processes: RuntimeManagerProviderProcess[] = [sharedBridge];
    const harness = createHarness(() => processes);
    await harness.monitor.sampleOnce();
    expect(harness.sent).toHaveLength(1);
    expect(harness.sent[0]).toMatchObject({
      type: "process-memory.sample",
      sampledAt: 1_700_000_000_000,
    });
    processes = [];
    await harness.monitor.sampleOnce();
    await harness.monitor.sampleOnce();
    expect(harness.sent).toHaveLength(2);
    expect(harness.sent[1]).toEqual({
      type: "process-memory.sample",
      sampledAt: 1_700_000_000_000,
      processes: [],
    });
  });

  it("keeps reporting while providers run even when ps lists none of them", async () => {
    let processes: RuntimeManagerProviderProcess[] = [
      { ...sharedBridge, pid: 999 },
    ];
    const harness = createHarness(() => processes);
    await harness.monitor.sampleOnce();
    await harness.monitor.sampleOnce();
    expect(harness.sent).toHaveLength(2);
    expect(harness.sent[1]).toMatchObject({ processes: [] });
    processes = [];
    await harness.monitor.sampleOnce();
    await harness.monitor.sampleOnce();
    expect(harness.sent).toHaveLength(3);
  });

  it("stops the interval timer", () => {
    const harness = createHarness(() => []);
    harness.monitor.stop();
    expect(harness.isCleared()).toBe(true);
  });
});
