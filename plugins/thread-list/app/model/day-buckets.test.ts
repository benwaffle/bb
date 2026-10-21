import { afterEach, describe, expect, it } from "vitest";
import {
  annotateFlatThreadItems,
  getFlatPreviousRowProjectIds,
  getNextLocalMidnight,
  getSidebarDayBucket,
} from "./day-buckets.js";
import {
  buildFlatThreadGroups,
  compareStandardThreads,
  type PluginThreadGroupDefinition,
} from "./project-thread-groups.js";
import { makeSidebarThread, type SidebarThreadOverrides } from "./fixtures.js";

const originalTimeZone = process.env.TZ;
const NO_COLLAPSED: ReadonlySet<string> = new Set();

function useTimeZone(timeZone: string): void {
  process.env.TZ = timeZone;
}

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
});

function local(
  year: number,
  month: number,
  day: number,
  hours = 12,
  minutes = 0,
  seconds = 0,
): number {
  return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
}

function thread(
  id: string,
  updatedAt: number,
  overrides: SidebarThreadOverrides = {},
) {
  return makeSidebarThread({
    id,
    updatedAt,
    latestAttentionAt: updatedAt,
    createdAt: updatedAt,
    ...overrides,
  });
}

describe("getSidebarDayBucket", () => {
  it("splits today from yesterday at local midnight", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 0, 0, 30);
    expect(getSidebarDayBucket(local(2026, 10, 21, 0, 0, 0), now)).toBe(
      "today",
    );
    expect(getSidebarDayBucket(local(2026, 10, 20, 23, 59, 59), now)).toBe(
      "yesterday",
    );
    expect(getNextLocalMidnight(now)).toBe(local(2026, 10, 22, 0, 0, 0));
  });

  it("counts calendar days, so a week ago is earlier and six days ago is this week", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 9);
    expect(getSidebarDayBucket(local(2026, 10, 15, 23, 59), now)).toBe(
      "thisWeek",
    );
    expect(getSidebarDayBucket(local(2026, 10, 14, 23, 59), now)).toBe(
      "earlier",
    );
    expect(getSidebarDayBucket(now + 60_000, now)).toBe("today");
  });

  it("uses the local calendar day, not UTC", () => {
    const updatedAt = Date.UTC(2026, 9, 21, 3, 0);
    const now = Date.UTC(2026, 9, 21, 15, 0);
    useTimeZone("UTC");
    expect(getSidebarDayBucket(updatedAt, now)).toBe("today");
    useTimeZone("America/Los_Angeles");
    expect(getSidebarDayBucket(updatedAt, now)).toBe("yesterday");
    useTimeZone("Asia/Tokyo");
    expect(getSidebarDayBucket(updatedAt, now)).toBe("yesterday");
  });

  it("keeps a day boundary across a daylight saving change", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 11, 2, 0, 30);
    expect(getSidebarDayBucket(local(2026, 11, 1, 0, 30), now)).toBe(
      "yesterday",
    );
    expect(getSidebarDayBucket(local(2026, 11, 1, 23, 30), now)).toBe(
      "yesterday",
    );
  });
});

function pluginGroup(
  id: string,
  threadIds: readonly string[],
  projectId: string,
): PluginThreadGroupDefinition {
  return {
    id,
    projectId,
    label: id,
    threadIds,
    rows: [],
    keepOrder: false,
    style: "flat",
  };
}

describe("annotateFlatThreadItems", () => {
  it("labels each day once and places a group in the day of its newest member", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 18);
    const items = buildFlatThreadGroups(
      [
        thread("today-a", local(2026, 10, 21, 9)),
        thread("member-old", local(2026, 10, 10)),
        thread("member-new", local(2026, 10, 20, 8)),
        thread("yesterday-b", local(2026, 10, 20, 7)),
        thread("earlier-c", local(2026, 9, 1)),
      ],
      compareStandardThreads,
      false,
      [pluginGroup("ticket", ["member-old", "member-new"], "proj_test")],
    );
    const annotations = annotateFlatThreadItems(items, {
      dayLabels: true,
      now,
      collapsedThreadIds: NO_COLLAPSED,
    });
    expect(
      items.map((item, index) => [
        item.kind === "thread" ? item.node.thread.id : item.kind,
        annotations[index]?.dayBucket,
      ]),
    ).toEqual([
      ["today-a", "today"],
      ["plugin-group", "yesterday"],
      ["yesterday-b", null],
      ["earlier-c", "earlier"],
    ]);
  });

  it("keeps a newer item that follows older ones in the older day, with no repeated label", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 18);
    const items = buildFlatThreadGroups(
      [
        thread("busy-yesterday", local(2026, 10, 20), { status: "active" }),
        thread("idle-today", local(2026, 10, 21, 9)),
      ],
      compareStandardThreads,
      false,
    );
    const annotations = annotateFlatThreadItems(items, {
      dayLabels: true,
      now,
      collapsedThreadIds: NO_COLLAPSED,
    });
    expect(annotations.map((annotation) => annotation.dayBucket)).toEqual([
      "yesterday",
      null,
    ]);
  });

  it("records the project of the row directly above and resets it at each day label", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 18);
    const items = buildFlatThreadGroups(
      [
        thread("a1", local(2026, 10, 21, 12), { projectId: "proj_a" }),
        thread("a2", local(2026, 10, 21, 11), { projectId: "proj_a" }),
        thread("b1", local(2026, 10, 21, 10), { projectId: "proj_b" }),
        thread("b2", local(2026, 10, 20, 10), { projectId: "proj_b" }),
      ],
      compareStandardThreads,
      false,
    );
    const previousRowProjects = (dayLabels: boolean) =>
      annotateFlatThreadItems(items, {
        dayLabels,
        now,
        collapsedThreadIds: NO_COLLAPSED,
      }).map(({ previousRowProjectId }) => previousRowProjectId);
    expect(previousRowProjects(true)).toEqual([null, "proj_a", "proj_a", null]);
    expect(previousRowProjects(false)).toEqual([
      null,
      "proj_a",
      "proj_a",
      "proj_b",
    ]);
  });

  it("forgets the project after a group, since a deeper row sits directly above", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 18);
    const items = buildFlatThreadGroups(
      [
        thread("before-group", local(2026, 10, 21, 10)),
        thread("member-a", local(2026, 10, 21, 9)),
        thread("member-b", local(2026, 10, 21, 9)),
        thread("after-group", local(2026, 10, 21, 8)),
      ],
      compareStandardThreads,
      false,
      [pluginGroup("ticket", ["member-a", "member-b"], "proj_test")],
    );
    expect(items.map((item) => item.kind)).toEqual([
      "thread",
      "plugin-group",
      "thread",
    ]);
    expect(
      annotateFlatThreadItems(items, {
        dayLabels: false,
        now,
        collapsedThreadIds: NO_COLLAPSED,
      }).map(({ previousRowProjectId }) => previousRowProjectId),
    ).toEqual([null, "proj_test", null]);
  });
});

describe("getFlatPreviousRowProjectIds", () => {
  it("leaves the first sibling under its parent or header without a row above", () => {
    const items = buildFlatThreadGroups(
      [
        thread("first", 300, { projectId: "proj_a" }),
        thread("second", 200, { projectId: "proj_a" }),
        thread("third", 100, { projectId: "proj_b" }),
      ],
      compareStandardThreads,
      false,
    );
    expect(getFlatPreviousRowProjectIds(items, NO_COLLAPSED)).toEqual([
      null,
      "proj_a",
      "proj_a",
    ]);
  });
});
