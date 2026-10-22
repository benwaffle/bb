import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import type { SidebarThread } from "../model/sidebar-thread.js";
import type { ThreadComparator } from "../model/project-thread-groups.js";
import {
  createThreadUnreadPredicate,
  groupComparatorByReadStatus,
  rememberHeldReadStatus,
  resolveHeldReadStatus,
  restoreHeldReadStatus,
  type HeldReadStatus,
} from "../model/read-status-grouping.js";
import {
  collapsedThreadIdsAtom,
  sidebarGroupByReadStatusAtom,
} from "../preferences/atoms.js";

function useHeldReadStatus(
  threads: readonly SidebarThread[],
  selectedThreadId: string | undefined,
): HeldReadStatus | null {
  const [held, setHeld] = useState<HeldReadStatus | null>(() =>
    restoreHeldReadStatus(selectedThreadId),
  );
  useEffect(() => {
    rememberHeldReadStatus(held);
  }, [held]);
  const next = resolveHeldReadStatus(held, threads, selectedThreadId);
  if (next !== held) {
    setHeld(next);
  }
  return next;
}

function toggleId(ids: readonly string[], id: string): string[] {
  return ids.includes(id)
    ? ids.filter((current) => current !== id)
    : [...ids, id];
}

export function useReadStatusGrouping({
  threads,
  selectedThreadId,
  comparator,
}: {
  threads: readonly SidebarThread[];
  selectedThreadId: string | undefined;
  comparator: ThreadComparator;
}) {
  const groupByReadStatus = useAtomValue(sidebarGroupByReadStatusAtom);
  const heldReadStatus = useHeldReadStatus(threads, selectedThreadId);
  const [collapsedThreadIdList, setCollapsedThreadIdList] = useAtom(
    collapsedThreadIdsAtom,
  );
  const groupedComparator = useMemo(
    () =>
      groupByReadStatus
        ? groupComparatorByReadStatus(
            comparator,
            createThreadUnreadPredicate(heldReadStatus),
          )
        : comparator,
    [comparator, groupByReadStatus, heldReadStatus],
  );
  const collapsedThreadIds = useMemo(
    () => new Set(collapsedThreadIdList),
    [collapsedThreadIdList],
  );
  const toggleThreadCollapsed = useCallback(
    (threadId: string) => {
      setCollapsedThreadIdList((current) => toggleId(current, threadId));
    },
    [setCollapsedThreadIdList],
  );
  return {
    comparator: groupedComparator,
    collapsedThreadIds,
    toggleThreadCollapsed,
  };
}

export function useExpandThreadAncestors() {
  const setCollapsedThreadIdList = useSetAtom(collapsedThreadIdsAtom);
  return useCallback(
    (threadIds: ReadonlySet<string>) => {
      setCollapsedThreadIdList((current) =>
        current.some((id) => threadIds.has(id))
          ? current.filter((id) => !threadIds.has(id))
          : current,
      );
    },
    [setCollapsedThreadIdList],
  );
}
