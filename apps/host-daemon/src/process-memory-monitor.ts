import type {
  HostDaemonDaemonWsMessage,
  HostDaemonProcessMemoryProcessSample,
  HostDaemonProcessMemoryThreadSample,
} from "@bb/host-daemon-contract";
import {
  readProcessMemoryTable,
  summarizeProcessTrees,
  supportsProcessMemoryTable,
  type ProcessMemoryTableRow,
} from "@bb/process-utils";
import { runtimeErrorLogFields } from "./error-utils.js";
import type { HostDaemonLogger } from "./logger.js";
import type { RuntimeManagerProviderProcess } from "./runtime-manager.js";

interface ProcessMemoryMonitorTimer {
  clear(): void;
  unref(): void;
}

type ProcessMemoryMonitorIntervalFn = (
  callback: () => void,
  intervalMs: number,
) => ProcessMemoryMonitorTimer;

interface ProcessMemoryMonitorOptions {
  logger: Pick<HostDaemonLogger, "warn">;
  listProviderProcesses: () => RuntimeManagerProviderProcess[];
  sendMessage: (message: HostDaemonDaemonWsMessage) => boolean;
  nowMs?: () => number;
  readProcessTable?: () => Promise<ProcessMemoryTableRow[]>;
  setIntervalFn?: ProcessMemoryMonitorIntervalFn;
  intervalMs?: number;
}

export interface ProcessMemoryMonitor {
  sampleOnce(): Promise<void>;
  stop(): void;
}

export const DEFAULT_PROCESS_MEMORY_SAMPLE_INTERVAL_MS = 5_000;

export function buildProcessMemorySamples(
  processes: readonly RuntimeManagerProviderProcess[],
  table: readonly ProcessMemoryTableRow[],
): HostDaemonProcessMemoryProcessSample[] {
  const rootPids = new Set<number>();
  for (const proc of processes) {
    rootPids.add(proc.pid);
    for (const thread of proc.threads) {
      if (thread.pid !== null) {
        rootPids.add(thread.pid);
      }
    }
  }
  const trees = summarizeProcessTrees(table, [...rootPids]);
  const samples: HostDaemonProcessMemoryProcessSample[] = [];
  for (const proc of processes) {
    const tree = trees.get(proc.pid);
    if (!tree) {
      continue;
    }
    const threads: HostDaemonProcessMemoryThreadSample[] = proc.threads.map(
      (thread) => {
        const threadTree =
          thread.pid !== null && tree.pids.has(thread.pid)
            ? trees.get(thread.pid)
            : undefined;
        return {
          threadId: thread.threadId,
          pid: thread.pid,
          rssBytes: threadTree?.rssBytes ?? null,
          processCount: threadTree?.processCount ?? null,
        };
      },
    );
    samples.push({
      environmentId: proc.environmentId,
      providerId: proc.providerId,
      pid: proc.pid,
      rssBytes: tree.rssBytes,
      processCount: tree.processCount,
      threads,
    });
  }
  return samples;
}

export function startProcessMemoryMonitor(
  options: ProcessMemoryMonitorOptions,
): ProcessMemoryMonitor {
  const intervalMs =
    options.intervalMs ?? DEFAULT_PROCESS_MEMORY_SAMPLE_INTERVAL_MS;
  const nowMs = options.nowMs ?? Date.now;
  const readProcessTable = options.readProcessTable ?? readProcessMemoryTable;
  const setIntervalFn: ProcessMemoryMonitorIntervalFn =
    options.setIntervalFn ??
    ((callback, ms) => {
      const timer = setInterval(callback, ms);
      return {
        clear: () => clearInterval(timer),
        unref: () => timer.unref(),
      };
    });

  let sampling = false;
  let lastReportHadProviderProcesses = false;

  async function sampleOnce(): Promise<void> {
    if (sampling || !supportsProcessMemoryTable()) {
      return;
    }
    const processes = options.listProviderProcesses();
    if (processes.length === 0) {
      if (lastReportHadProviderProcesses) {
        lastReportHadProviderProcesses = false;
        options.sendMessage({
          type: "process-memory.sample",
          sampledAt: nowMs(),
          processes: [],
        });
      }
      return;
    }
    sampling = true;
    try {
      const table = await readProcessTable();
      const samples = buildProcessMemorySamples(processes, table);
      lastReportHadProviderProcesses = true;
      options.sendMessage({
        type: "process-memory.sample",
        sampledAt: nowMs(),
        processes: samples,
      });
    } catch (error) {
      options.logger.warn(
        { ...runtimeErrorLogFields(error) },
        "Process memory sampling failed",
      );
    } finally {
      sampling = false;
    }
  }

  const timer = setIntervalFn(() => {
    void sampleOnce();
  }, intervalMs);
  timer.unref();

  return {
    sampleOnce,
    stop() {
      timer.clear();
    },
  };
}
