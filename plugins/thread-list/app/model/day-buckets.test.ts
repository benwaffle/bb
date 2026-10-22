import { afterEach, describe, expect, it } from "vitest";
import {
  annotateFlatThreadItems,
  getNextLocalMidnight,
  getSidebarDayBucket,
} from "./day-buckets.js";
import {
  buildFlatThreadGroups,
  buildSectionThreadList,
  compareStandardThreads,
  type PluginThreadGroupDefinition,
  type ProjectThreadItem,
} from "./project-thread-groups.js";
import { makeSidebarThread, type SidebarThreadOverrides } from "./fixtures.js";

const originalTimeZone = process.env.TZ;

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
    });
    expect(annotations.map((annotation) => annotation.dayBucket)).toEqual([
      "yesterday",
      null,
    ]);
  });
});

function summarizeTree(items: readonly ProjectThreadItem[]): unknown[] {
  return items.map((item) => {
    switch (item.kind) {
      case "thread":
        return item.node.children.length === 0
          ? item.node.thread.id
          : [item.node.thread.id, summarizeTree(item.node.children)];
      case "section":
        return [item.group.id, summarizeTree(item.group.items)];
      case "environment":
      case "plugin-group":
        return item.kind;
    }
  });
}

describe("flat thread list nesting", () => {
  it("places a parent at its newest member and labels that member's day", () => {
    useTimeZone("America/New_York");
    const now = local(2026, 10, 21, 18);
    const items = buildFlatThreadGroups(
      [
        thread("today-a", local(2026, 10, 21, 9)),
        thread("parent", local(2026, 10, 10)),
        thread("child-new", local(2026, 10, 21, 10), {
          parentThreadId: "parent",
        }),
        thread("child-old", local(2026, 10, 20, 8), {
          parentThreadId: "parent",
        }),
        thread("yesterday-b", local(2026, 10, 20, 7)),
      ],
      compareStandardThreads,
      false,
    );
    expect(summarizeTree(items)).toEqual([
      ["parent", ["child-new", "child-old"]],
      "today-a",
      "yesterday-b",
    ]);
    expect(
      annotateFlatThreadItems(items, { dayLabels: true, now }).map(
        ({ dayBucket }, index) => [
          summarizeTree(items.slice(index, index + 1))[0],
          dayBucket,
        ],
      ),
    ).toEqual([
      [["parent", ["child-new", "child-old"]], "today"],
      ["today-a", null],
      ["yesterday-b", "yesterday"],
    ]);
  });

  it("keeps a child whose parent is not in the list as its own top-level row", () => {
    const items = buildFlatThreadGroups(
      [
        thread("newer", 300),
        thread("orphan", 200, { parentThreadId: "archived-parent" }),
        thread("older", 100),
      ],
      compareStandardThreads,
      false,
    );
    expect(summarizeTree(items)).toEqual(["newer", "orphan", "older"]);
  });

  it("orders custom sections and loose rows by each parent's newest member", () => {
    const items = buildSectionThreadList(
      [
        thread("loose-newer", 400),
        thread("loose-parent", 100),
        thread("loose-child", 500, { parentThreadId: "loose-parent" }),
        thread("section-newer", 300, { sectionId: "sec" }),
        thread("section-parent", 50, { sectionId: "sec" }),
        thread("section-child", 350, { parentThreadId: "section-parent" }),
      ],
      compareStandardThreads,
      [{ id: "sec", name: "Section" }],
    );
    expect(summarizeTree(items)).toEqual([
      ["sec", [["section-parent", ["section-child"]], "section-newer"]],
      ["loose-parent", ["loose-child"]],
      "loose-newer",
    ]);
  });
});
