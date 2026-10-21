import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAtomValue } from "jotai";
import { cn } from "@/lib/utils";
import {
  annotateFlatThreadItems,
  getFlatPreviousRowProjectIds,
  getNextLocalMidnight,
  SIDEBAR_DAY_BUCKET_LABEL,
  type FlatThreadItemAnnotation,
  type SidebarDayBucket,
} from "../model/day-buckets.js";
import type { ProjectThreadItem } from "../model/project-thread-groups.js";
import {
  sidebarChronologicalSortAtom,
  sidebarDayLabelsAtom,
  sidebarSortDirectionAtom,
} from "../preferences/atoms.js";

export interface FlatThreadList {
  dayLabels: boolean;
}

export interface FlatThreadItemScope {
  previousRowProjectId: string | null;
  inGroup: boolean;
}

const NO_DAY_LABELS: FlatThreadList = { dayLabels: false };
const WITH_DAY_LABELS: FlatThreadList = { dayLabels: true };

export const FLAT_ROW_PADDING_PX = 12;
export const FLAT_ROW_DEPTH_STEP_PX = 14;
export const FLAT_GROUP_GUIDE_LEFT_PX = 17;

export const FlatThreadListContext = createContext<FlatThreadList | null>(null);

export const FlatThreadItemContext = createContext<FlatThreadItemScope | null>(
  null,
);

export function useFlatThreadList(): FlatThreadList | null {
  return useContext(FlatThreadListContext);
}

export function useFlatThreadItemScope(): FlatThreadItemScope | null {
  return useContext(FlatThreadItemContext);
}

export function getFlatRowPaddingLeft(depth: number): number {
  return FLAT_ROW_PADDING_PX + depth * FLAT_ROW_DEPTH_STEP_PX;
}

export function getFlatGroupGuideLeft(depth: number): number {
  return (
    getFlatRowPaddingLeft(depth) +
    FLAT_GROUP_GUIDE_LEFT_PX -
    FLAT_ROW_PADDING_PX
  );
}

export function FlatThreadListProvider({ children }: { children: ReactNode }) {
  const dayLabels = useAtomValue(sidebarDayLabelsAtom);
  const sort = useAtomValue(sidebarChronologicalSortAtom);
  const direction = useAtomValue(sidebarSortDirectionAtom);
  const sortedByUpdate =
    (sort === "updated" || sort === "none") && direction !== "ascending";
  return (
    <FlatThreadListContext.Provider
      value={dayLabels && sortedByUpdate ? WITH_DAY_LABELS : NO_DAY_LABELS}
    >
      {children}
    </FlatThreadListContext.Provider>
  );
}

export function FlatThreadListWithoutDayLabels({
  children,
}: {
  children: ReactNode;
}) {
  const list = useFlatThreadList();
  return (
    <FlatThreadListContext.Provider
      value={list === null ? null : NO_DAY_LABELS}
    >
      {children}
    </FlatThreadListContext.Provider>
  );
}

function useLocalNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const timeout = setTimeout(
      () => setNow(Date.now()),
      getNextLocalMidnight(now) - Date.now() + 1000,
    );
    return () => clearTimeout(timeout);
  }, [enabled, now]);
  return now;
}

export function useFlatThreadItemAnnotations(
  items: readonly ProjectThreadItem[],
  collapsedThreadIds: ReadonlySet<string>,
): readonly FlatThreadItemAnnotation[] | null {
  const list = useFlatThreadList();
  const now = useLocalNow(list?.dayLabels ?? false);
  return useMemo(
    () =>
      list === null
        ? null
        : annotateFlatThreadItems(items, {
            dayLabels: list.dayLabels,
            now,
            collapsedThreadIds,
          }),
    [collapsedThreadIds, items, list, now],
  );
}

export function useFlatPreviousRowProjectIds(
  items: readonly ProjectThreadItem[],
  collapsedThreadIds: ReadonlySet<string>,
): readonly (string | null)[] | null {
  const list = useFlatThreadList();
  return useMemo(
    () =>
      list === null
        ? null
        : getFlatPreviousRowProjectIds(items, collapsedThreadIds),
    [collapsedThreadIds, items, list],
  );
}

export function SidebarDayLabel({
  bucket,
  first,
}: {
  bucket: SidebarDayBucket;
  first: boolean;
}) {
  return (
    <div
      data-sidebar-day-label={bucket}
      role="heading"
      aria-level={3}
      className={cn(
        "select-none px-3 pb-1 text-eyebrow font-semibold uppercase tracking-[0.08em] text-subtle-foreground",
        first ? "pt-2" : "pt-4",
      )}
    >
      {SIDEBAR_DAY_BUCKET_LABEL[bucket]}
    </div>
  );
}

export function FlatThreadItemFrame({
  annotation,
  first,
  children,
}: {
  annotation: FlatThreadItemAnnotation | undefined;
  first: boolean;
  children: ReactNode;
}) {
  const scope = useMemo<FlatThreadItemScope | null>(
    () =>
      annotation === undefined
        ? null
        : {
            previousRowProjectId: annotation.previousRowProjectId,
            inGroup: false,
          },
    [annotation],
  );
  if (annotation === undefined) return <>{children}</>;
  return (
    <>
      {annotation.dayBucket === null ? null : (
        <SidebarDayLabel bucket={annotation.dayBucket} first={first} />
      )}
      <FlatThreadItemContext.Provider value={scope}>
        {children}
      </FlatThreadItemContext.Provider>
    </>
  );
}

export function FlatThreadRowScope({
  previousRowProjectId,
  inGroup,
  children,
}: {
  previousRowProjectId: string | null | undefined;
  inGroup: boolean;
  children: ReactNode;
}) {
  const scope = useMemo<FlatThreadItemScope | null>(
    () =>
      previousRowProjectId === undefined
        ? null
        : { previousRowProjectId, inGroup },
    [inGroup, previousRowProjectId],
  );
  if (scope === null) return <>{children}</>;
  return (
    <FlatThreadItemContext.Provider value={scope}>
      {children}
    </FlatThreadItemContext.Provider>
  );
}

export function shouldShowRowProject(
  scope: FlatThreadItemScope | null,
  projectId: string,
): boolean {
  return scope === null || projectId !== scope.previousRowProjectId;
}

export function projectHueEdgeColor(hue: number): string {
  return `oklch(var(--project-hue-edge-l) var(--project-hue-edge-c) ${hue})`;
}

export function projectHueTextColor(hue: number): string {
  return `oklch(var(--project-hue-text-l) var(--project-hue-text-c) ${hue})`;
}

export function ProjectHueEdge({
  hue,
  className,
}: {
  hue: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-sidebar-project-hue-edge={hue}
      className={cn(
        "pointer-events-none absolute left-px z-[1] w-[3px] rounded-[2px]",
        className ?? "inset-y-2",
      )}
      style={{ backgroundColor: projectHueEdgeColor(hue) }}
    />
  );
}
