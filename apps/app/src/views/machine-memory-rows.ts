import type { ThreadListEntry, ThreadMemoryUsage } from "@bb/domain";
import { getThreadDisplayTitle } from "@/lib/thread-title";

export interface MachineMemoryRow {
  threadId: string;
  projectId: string;
  title: string;
  usage: ThreadMemoryUsage;
}

export type MachineMemorySortColumn = "thread" | "memory" | "processes";

export interface MachineMemorySort {
  column: MachineMemorySortColumn;
  descending: boolean;
}

export const DEFAULT_MACHINE_MEMORY_SORT: MachineMemorySort = {
  column: "memory",
  descending: true,
};

export function buildMachineMemoryRows(
  threads: readonly ThreadListEntry[],
  hostId: string,
): MachineMemoryRow[] {
  const rows: MachineMemoryRow[] = [];
  for (const thread of threads) {
    if (thread.environmentHostId !== hostId || !thread.memoryUsage) {
      continue;
    }
    rows.push({
      threadId: thread.id,
      projectId: thread.projectId,
      title: getThreadDisplayTitle(thread),
      usage: thread.memoryUsage,
    });
  }
  return rows;
}

export function sortMachineMemoryRows(
  rows: readonly MachineMemoryRow[],
  sort: MachineMemorySort,
): MachineMemoryRow[] {
  const direction = sort.descending ? -1 : 1;
  return [...rows].sort((left, right) => {
    const comparison =
      sort.column === "thread"
        ? left.title.localeCompare(right.title)
        : sort.column === "processes"
          ? left.usage.processCount - right.usage.processCount
          : left.usage.rssBytes - right.usage.rssBytes;
    if (comparison !== 0) {
      return direction * comparison;
    }
    return left.threadId.localeCompare(right.threadId);
  });
}

export function nextMachineMemorySort(
  current: MachineMemorySort,
  column: MachineMemorySortColumn,
): MachineMemorySort {
  if (current.column === column) {
    return { column, descending: !current.descending };
  }
  return { column, descending: column !== "thread" };
}
