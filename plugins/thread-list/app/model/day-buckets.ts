import {
  getProjectThreadItemDescendants,
  type ProjectThreadItem,
} from "./project-thread-groups.js";

export const SIDEBAR_DAY_BUCKETS = [
  "today",
  "yesterday",
  "thisWeek",
  "earlier",
] as const;

export type SidebarDayBucket = (typeof SIDEBAR_DAY_BUCKETS)[number];

export const SIDEBAR_DAY_BUCKET_LABEL: Record<SidebarDayBucket, string> = {
  today: "Today",
  yesterday: "Yesterday",
  thisWeek: "This week",
  earlier: "Earlier",
};

const MS_PER_DAY = 86_400_000;

function localDayNumber(time: number): number {
  const date = new Date(time);
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY,
  );
}

export function getSidebarDayBucket(
  time: number,
  now: number,
): SidebarDayBucket {
  const daysAgo = localDayNumber(now) - localDayNumber(time);
  if (daysAgo <= 0) return "today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 7) return "thisWeek";
  return "earlier";
}

export function getNextLocalMidnight(now: number): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

export interface FlatThreadItemAnnotation {
  dayBucket: SidebarDayBucket | null;
}

function newestUpdatedAt(item: ProjectThreadItem): number | null {
  switch (item.kind) {
    case "thread":
      return getProjectThreadItemDescendants([item]).reduce(
        (newest, thread) => Math.max(newest, thread.updatedAt),
        item.node.thread.updatedAt,
      );
    case "environment":
    case "plugin-group":
      return item.group.nodes.reduce<number | null>(
        (newest, node) =>
          newest === null || node.thread.updatedAt > newest
            ? node.thread.updatedAt
            : newest,
        null,
      );
    case "section":
      return null;
  }
}

export function annotateFlatThreadItems(
  items: readonly ProjectThreadItem[],
  { dayLabels, now }: { dayLabels: boolean; now: number },
): FlatThreadItemAnnotation[] {
  let bucketIndex = -1;
  return items.map((item) => {
    let dayBucket: SidebarDayBucket | null = null;
    const updatedAt = newestUpdatedAt(item);
    if (dayLabels && updatedAt !== null) {
      const index = Math.max(
        bucketIndex,
        SIDEBAR_DAY_BUCKETS.indexOf(getSidebarDayBucket(updatedAt, now)),
      );
      if (index !== bucketIndex) {
        bucketIndex = index;
        dayBucket = SIDEBAR_DAY_BUCKETS[index] ?? null;
      }
    }
    return { dayBucket };
  });
}
