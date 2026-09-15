import type { HostMemoryUsage, ThreadMemoryUsage } from "@bb/domain";
import type { HostDaemonProcessMemorySampleMessage } from "@bb/host-daemon-contract";

export interface HostMemoryUsageSnapshot {
  host: HostMemoryUsage;
  threads: Map<string, ThreadMemoryUsage>;
}

function mergeThreadUsage(
  existing: ThreadMemoryUsage | undefined,
  next: ThreadMemoryUsage,
): ThreadMemoryUsage {
  if (!existing) {
    return next;
  }
  return {
    rssBytes: existing.rssBytes + next.rssBytes,
    processCount: existing.processCount + next.processCount,
    sharedThreadCount: Math.max(
      existing.sharedThreadCount,
      next.sharedThreadCount,
    ),
    sampledAt: next.sampledAt,
  };
}

export function assembleHostMemoryUsage(
  message: HostDaemonProcessMemorySampleMessage,
): HostMemoryUsageSnapshot {
  const threads = new Map<string, ThreadMemoryUsage>();
  let hostRssBytes = 0;
  let hostProcessCount = 0;
  for (const proc of message.processes) {
    hostRssBytes += proc.rssBytes;
    hostProcessCount += proc.processCount;
    let attributedRssBytes = 0;
    let attributedProcessCount = 0;
    const unattributedThreadIds: string[] = [];
    for (const thread of proc.threads) {
      if (thread.rssBytes === null || thread.processCount === null) {
        unattributedThreadIds.push(thread.threadId);
        continue;
      }
      attributedRssBytes += thread.rssBytes;
      attributedProcessCount += thread.processCount;
      threads.set(
        thread.threadId,
        mergeThreadUsage(threads.get(thread.threadId), {
          rssBytes: thread.rssBytes,
          processCount: thread.processCount,
          sharedThreadCount: 1,
          sampledAt: message.sampledAt,
        }),
      );
    }
    if (unattributedThreadIds.length === 0) {
      continue;
    }
    const sharedUsage: ThreadMemoryUsage = {
      rssBytes: Math.max(0, proc.rssBytes - attributedRssBytes),
      processCount: Math.max(0, proc.processCount - attributedProcessCount),
      sharedThreadCount: unattributedThreadIds.length,
      sampledAt: message.sampledAt,
    };
    for (const threadId of unattributedThreadIds) {
      threads.set(
        threadId,
        mergeThreadUsage(threads.get(threadId), sharedUsage),
      );
    }
  }
  return {
    host: {
      rssBytes: hostRssBytes,
      processCount: hostProcessCount,
      sampledAt: message.sampledAt,
    },
    threads,
  };
}

function snapshotFingerprint(snapshot: HostMemoryUsageSnapshot): string {
  return JSON.stringify({
    host: [snapshot.host.rssBytes, snapshot.host.processCount],
    threads: [...snapshot.threads.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([threadId, usage]) => [
        threadId,
        usage.rssBytes,
        usage.processCount,
        usage.sharedThreadCount,
      ]),
  });
}

export class HostMemoryUsageStore {
  private readonly snapshotsByHostId = new Map<
    string,
    HostMemoryUsageSnapshot
  >();
  private readonly hostIdByThreadId = new Map<string, string>();

  replace(
    hostId: string,
    message: HostDaemonProcessMemorySampleMessage,
  ): boolean {
    const previous = this.snapshotsByHostId.get(hostId);
    const next = assembleHostMemoryUsage(message);
    if (previous) {
      for (const threadId of previous.threads.keys()) {
        if (this.hostIdByThreadId.get(threadId) === hostId) {
          this.hostIdByThreadId.delete(threadId);
        }
      }
    }
    for (const threadId of next.threads.keys()) {
      this.hostIdByThreadId.set(threadId, hostId);
    }
    this.snapshotsByHostId.set(hostId, next);
    return (
      previous === undefined ||
      snapshotFingerprint(previous) !== snapshotFingerprint(next)
    );
  }

  clear(hostId: string): boolean {
    const previous = this.snapshotsByHostId.get(hostId);
    if (!previous) {
      return false;
    }
    for (const threadId of previous.threads.keys()) {
      if (this.hostIdByThreadId.get(threadId) === hostId) {
        this.hostIdByThreadId.delete(threadId);
      }
    }
    this.snapshotsByHostId.delete(hostId);
    return true;
  }

  getSnapshot(hostId: string): HostMemoryUsageSnapshot | null {
    return this.snapshotsByHostId.get(hostId) ?? null;
  }

  getHostMemoryUsage(hostId: string): HostMemoryUsage | null {
    return this.snapshotsByHostId.get(hostId)?.host ?? null;
  }

  getThreadMemoryUsage(threadId: string): ThreadMemoryUsage | null {
    const hostId = this.hostIdByThreadId.get(threadId);
    if (hostId === undefined) {
      return null;
    }
    return this.snapshotsByHostId.get(hostId)?.threads.get(threadId) ?? null;
  }
}
