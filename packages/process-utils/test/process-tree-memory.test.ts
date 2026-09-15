import { describe, expect, it } from "vitest";
import {
  parseProcessMemoryTable,
  readProcessMemoryTable,
  summarizeProcessTrees,
  supportsProcessMemoryTable,
} from "../src/index.js";

const KB = 1024;

describe("parseProcessMemoryTable", () => {
  it("parses ps rows with padded columns and converts kilobytes to bytes", () => {
    const rows = parseProcessMemoryTable(
      [
        "    1     0     1  18720",
        "  171     1   171   4320",
        "",
        "PID PPID PGID RSS",
        " 9999  171   171 notanumber",
      ].join("\n"),
    );
    expect(rows).toEqual([
      { pid: 1, ppid: 0, pgid: 1, rssBytes: 18720 * KB },
      { pid: 171, ppid: 1, pgid: 171, rssBytes: 4320 * KB },
    ]);
  });
});

describe("summarizeProcessTrees", () => {
  const table = parseProcessMemoryTable(
    [
      "1 0 1 100",
      "10 1 10 200",
      "11 10 10 300",
      "12 11 10 400",
      "13 10 13 500",
      "20 1 20 600",
      "21 1 10 700",
    ].join("\n"),
  );

  it("sums a root's resident memory with every descendant", () => {
    const trees = summarizeProcessTrees(table, [10]);
    expect(trees.get(10)).toEqual({
      rssBytes: (200 + 300 + 400 + 500 + 700) * KB,
      processCount: 5,
      pids: new Set([10, 11, 12, 13, 21]),
    });
  });

  it("includes reparented members of the root's process group once", () => {
    const trees = summarizeProcessTrees(table, [10, 20]);
    expect(trees.get(20)).toEqual({
      rssBytes: 600 * KB,
      processCount: 1,
      pids: new Set([20]),
    });
    expect(trees.get(10)?.processCount).toBe(5);
  });

  it("omits roots that are not in the table", () => {
    const trees = summarizeProcessTrees(table, [404]);
    expect(trees.size).toBe(0);
  });

  it("summarizes nested roots independently", () => {
    const trees = summarizeProcessTrees(table, [10, 11]);
    expect(trees.get(11)).toEqual({
      rssBytes: (300 + 400) * KB,
      processCount: 2,
      pids: new Set([11, 12]),
    });
  });
});

describe("readProcessMemoryTable", () => {
  it("lists the current process on supported platforms", async () => {
    const rows = await readProcessMemoryTable();
    if (!supportsProcessMemoryTable()) {
      expect(rows).toEqual([]);
      return;
    }
    const self = rows.find((row) => row.pid === process.pid);
    expect(self).toBeDefined();
    expect(self!.rssBytes).toBeGreaterThan(0);
    expect(self!.ppid).toBe(process.ppid);
  });
});
