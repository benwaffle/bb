import { execFile } from "node:child_process";

export interface ProcessMemoryTableRow {
  pid: number;
  ppid: number;
  pgid: number;
  rssBytes: number;
}

export interface ProcessTreeMemory {
  rssBytes: number;
  processCount: number;
  pids: ReadonlySet<number>;
}

const PS_RSS_UNIT_BYTES = 1024;
const PS_TABLE_TIMEOUT_MS = 10_000;
const PS_TABLE_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export function parseProcessMemoryTable(text: string): ProcessMemoryTableRow[] {
  const rows: ProcessMemoryTableRow[] = [];
  for (const line of text.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length !== 4) {
      continue;
    }
    const [pid, ppid, pgid, rssKb] = fields.map((field) => Number(field));
    if (
      !Number.isInteger(pid) ||
      !Number.isInteger(ppid) ||
      !Number.isInteger(pgid) ||
      !Number.isFinite(rssKb)
    ) {
      continue;
    }
    rows.push({
      pid,
      ppid,
      pgid,
      rssBytes: Math.max(0, rssKb) * PS_RSS_UNIT_BYTES,
    });
  }
  return rows;
}

export function supportsProcessMemoryTable(): boolean {
  return process.platform === "darwin" || process.platform === "linux";
}

export async function readProcessMemoryTable(): Promise<
  ProcessMemoryTableRow[]
> {
  if (!supportsProcessMemoryTable()) {
    return [];
  }
  const stdout = await new Promise<string>((resolve, reject) => {
    execFile(
      "ps",
      ["-axo", "pid=,ppid=,pgid=,rss="],
      {
        encoding: "utf8",
        maxBuffer: PS_TABLE_MAX_BUFFER_BYTES,
        timeout: PS_TABLE_TIMEOUT_MS,
      },
      (error, out) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(out);
      },
    );
  });
  return parseProcessMemoryTable(stdout);
}

export function summarizeProcessTrees(
  rows: readonly ProcessMemoryTableRow[],
  rootPids: readonly number[],
): Map<number, ProcessTreeMemory> {
  const childrenByPpid = new Map<number, ProcessMemoryTableRow[]>();
  const rowsByPgid = new Map<number, ProcessMemoryTableRow[]>();
  const rowsByPid = new Map<number, ProcessMemoryTableRow>();
  for (const row of rows) {
    rowsByPid.set(row.pid, row);
    const siblings = childrenByPpid.get(row.ppid);
    if (siblings) {
      siblings.push(row);
    } else {
      childrenByPpid.set(row.ppid, [row]);
    }
    const groupMembers = rowsByPgid.get(row.pgid);
    if (groupMembers) {
      groupMembers.push(row);
    } else {
      rowsByPgid.set(row.pgid, [row]);
    }
  }

  const result = new Map<number, ProcessTreeMemory>();
  for (const rootPid of rootPids) {
    const root = rowsByPid.get(rootPid);
    if (!root) {
      continue;
    }
    const visited = new Set<number>();
    const stack: ProcessMemoryTableRow[] = [
      root,
      ...(rowsByPgid.get(rootPid) ?? []),
    ];
    let rssBytes = 0;
    while (stack.length > 0) {
      const row = stack.pop()!;
      if (visited.has(row.pid)) {
        continue;
      }
      visited.add(row.pid);
      rssBytes += row.rssBytes;
      for (const child of childrenByPpid.get(row.pid) ?? []) {
        stack.push(child);
      }
    }
    result.set(rootPid, {
      rssBytes,
      processCount: visited.size,
      pids: visited,
    });
  }
  return result;
}
