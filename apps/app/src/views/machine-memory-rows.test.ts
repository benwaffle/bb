import type { ThreadListEntry, ThreadMemoryUsage } from "@bb/domain";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import { describe, expect, it } from "vitest";
import {
  buildMachineMemoryRows,
  DEFAULT_MACHINE_MEMORY_SORT,
  nextMachineMemorySort,
  sortMachineMemoryRows,
} from "./machine-memory-rows";

const MB = 1024 * 1024;

function usage(
  rssBytes: number,
  processCount: number,
  sharedThreadCount = 1,
): ThreadMemoryUsage {
  return {
    rssBytes,
    processCount,
    sharedThreadCount,
    sampledAt: 1_700_000_000_000,
  };
}

function thread(overrides: Partial<ThreadListEntry>): ThreadListEntry {
  return makeThreadListEntry({
    environmentHostId: "host_1",
    ...overrides,
  });
}

describe("buildMachineMemoryRows", () => {
  it("keeps only sampled threads on the requested machine", () => {
    const rows = buildMachineMemoryRows(
      [
        thread({ id: "thr_here", title: "Here", memoryUsage: usage(MB, 2) }),
        thread({ id: "thr_idle", title: "Idle", memoryUsage: null }),
        thread({
          id: "thr_other_host",
          title: "Elsewhere",
          environmentHostId: "host_2",
          memoryUsage: usage(MB, 2),
        }),
        thread({
          id: "thr_no_host",
          title: "Unplaced",
          environmentHostId: null,
          memoryUsage: usage(MB, 2),
        }),
      ],
      "host_1",
    );
    expect(rows.map((row) => row.threadId)).toEqual(["thr_here"]);
  });

  it("carries the project for the row link and falls back to a title", () => {
    const rows = buildMachineMemoryRows(
      [
        thread({
          id: "thr_titled",
          projectId: "proj_1",
          title: null,
          titleFallback: "First prompt wins",
          memoryUsage: usage(MB, 1),
        }),
      ],
      "host_1",
    );
    expect(rows[0]).toMatchObject({
      projectId: "proj_1",
      title: "First prompt wins",
    });
  });
});

describe("sortMachineMemoryRows", () => {
  const rows = buildMachineMemoryRows(
    [
      thread({ id: "thr_b", title: "Beta", memoryUsage: usage(9 * MB, 2) }),
      thread({ id: "thr_a", title: "Alpha", memoryUsage: usage(9 * MB, 40) }),
      thread({ id: "thr_c", title: "Gamma", memoryUsage: usage(90 * MB, 3) }),
    ],
    "host_1",
  );

  it("defaults to the heaviest thread first", () => {
    expect(
      sortMachineMemoryRows(rows, DEFAULT_MACHINE_MEMORY_SORT).map(
        (row) => row.threadId,
      ),
    ).toEqual(["thr_c", "thr_a", "thr_b"]);
  });

  it("breaks ties on thread id so equal rows keep a stable order", () => {
    expect(
      sortMachineMemoryRows(rows, {
        column: "memory",
        descending: false,
      }).map((row) => row.threadId),
    ).toEqual(["thr_a", "thr_b", "thr_c"]);
  });

  it("sorts by process count and by title independently of memory", () => {
    expect(
      sortMachineMemoryRows(rows, { column: "processes", descending: true }).map(
        (row) => row.threadId,
      ),
    ).toEqual(["thr_a", "thr_c", "thr_b"]);
    expect(
      sortMachineMemoryRows(rows, { column: "thread", descending: false }).map(
        (row) => row.title,
      ),
    ).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("leaves the input array untouched", () => {
    const order = rows.map((row) => row.threadId);
    sortMachineMemoryRows(rows, { column: "thread", descending: true });
    expect(rows.map((row) => row.threadId)).toEqual(order);
  });
});

describe("nextMachineMemorySort", () => {
  it("flips direction on the active column and picks a sensible default otherwise", () => {
    expect(
      nextMachineMemorySort({ column: "memory", descending: true }, "memory"),
    ).toEqual({ column: "memory", descending: false });
    expect(
      nextMachineMemorySort({ column: "memory", descending: true }, "thread"),
    ).toEqual({ column: "thread", descending: false });
    expect(
      nextMachineMemorySort(
        { column: "thread", descending: false },
        "processes",
      ),
    ).toEqual({ column: "processes", descending: true });
  });
});
