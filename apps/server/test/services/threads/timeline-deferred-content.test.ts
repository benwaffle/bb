import { describe, expect, it } from "vitest";
import type { TimelineSearchWorkRow } from "@bb/server-contract";
import {
  TIMELINE_DEFERRED_CONTENT_MIN_CHARS,
  deferSettledTimelineRow,
} from "../../../src/services/threads/timeline-deferred-content.js";

function globRow(
  overrides: Partial<TimelineSearchWorkRow>,
): TimelineSearchWorkRow {
  return {
    id: "glob-1",
    threadId: "thr_1",
    turnId: "turn-1",
    sourceSeqStart: 1,
    sourceSeqEnd: 2,
    startedAt: 1,
    createdAt: 1,
    kind: "work",
    workKind: "search",
    status: "completed",
    callId: "toolu_glob",
    mode: "path",
    query: "**/*.ts",
    path: "src",
    cmd: null,
    toolName: "Glob",
    toolArgs: { pattern: "**/*.ts", path: "src" },
    output: "src/a.ts",
    completedAt: 2,
    ...overrides,
  };
}

describe("deferSettledTimelineRow for read-only tool rows", () => {
  const largeOutput = "src/a.ts\n".repeat(TIMELINE_DEFERRED_CONTENT_MIN_CHARS);

  it("defers a settled search row's large result and keeps its input", () => {
    expect(deferSettledTimelineRow(globRow({ output: largeOutput }))).toEqual(
      globRow({ output: "", contentDeferred: true }),
    );
  });

  it("keeps a small result inline", () => {
    const row = globRow({});
    expect(deferSettledTimelineRow(row)).toBe(row);
  });

  it("keeps a pending row's result inline", () => {
    const row = globRow({ status: "pending", output: largeOutput });
    expect(deferSettledTimelineRow(row)).toBe(row);
  });
});
