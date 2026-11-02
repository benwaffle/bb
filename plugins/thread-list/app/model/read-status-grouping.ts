import type { SidebarThread } from "./sidebar-thread.js";
import type { ThreadComparator } from "./project-thread-groups.js";

export interface HeldReadStatus {
  selectedThreadId: string | undefined;
  sortSignature: string;
  isUnreadByThreadId: ReadonlyMap<string, boolean>;
}

export type ThreadUnreadPredicate = (thread: SidebarThread) => boolean;

function isUnreadDoneThread(thread: SidebarThread): boolean {
  return (
    thread.parentThreadId === null &&
    thread.isUnread &&
    (thread.status === "idle" || thread.status === "error")
  );
}

let lastHeldReadStatus: HeldReadStatus | null = null;

export function rememberHeldReadStatus(held: HeldReadStatus | null): void {
  lastHeldReadStatus = held;
}

export function restoreHeldReadStatus(
  selectedThreadId: string | undefined,
): HeldReadStatus | null {
  return lastHeldReadStatus?.selectedThreadId === selectedThreadId
    ? lastHeldReadStatus
    : null;
}

export function threadSortSignature(
  threads: readonly SidebarThread[],
): string {
  return threads
    .map((thread) =>
      [
        thread.id,
        thread.parentThreadId,
        thread.sectionId,
        thread.status,
        thread.createdAt,
        thread.latestAttentionAt,
        thread.displayTitle,
        thread.isPinned,
        thread.isArchived,
        thread.isHidden,
      ].join("\u0000"),
    )
    .sort()
    .join("\u0001");
}

export function resolveHeldReadStatus(
  held: HeldReadStatus | null,
  threads: readonly SidebarThread[],
  selectedThreadId: string | undefined,
  sortSignature = threadSortSignature(threads),
): HeldReadStatus | null {
  if (
    held !== null &&
    held.selectedThreadId === selectedThreadId &&
    held.sortSignature === sortSignature
  ) {
    return held;
  }
  const isUnreadByThreadId = new Map<string, boolean>();
  if (held?.sortSignature === sortSignature) {
    for (const [threadId, isUnread] of held.isUnreadByThreadId) {
      isUnreadByThreadId.set(threadId, isUnread);
    }
  }
  if (selectedThreadId !== undefined) {
    const heldSelected = held?.isUnreadByThreadId.get(selectedThreadId);
    const selected = threads.find((thread) => thread.id === selectedThreadId);
    if (heldSelected !== undefined) {
      isUnreadByThreadId.set(selectedThreadId, heldSelected);
    } else if (selected) {
      isUnreadByThreadId.set(selectedThreadId, selected.isUnread);
    }
  }
  return isUnreadByThreadId.size === 0
    ? null
    : { selectedThreadId, sortSignature, isUnreadByThreadId };
}

export function createThreadUnreadPredicate(
  held: HeldReadStatus | null,
): ThreadUnreadPredicate {
  return (thread) => {
    const heldIsUnread = held?.isUnreadByThreadId.get(thread.id);
    return isUnreadDoneThread(
      heldIsUnread === undefined
        ? thread
        : { ...thread, isUnread: heldIsUnread },
    );
  };
}

export function groupComparatorByReadStatus(
  compareThreads: ThreadComparator,
  isUnread: ThreadUnreadPredicate,
): ThreadComparator {
  const compareReadStatus = (left: SidebarThread, right: SidebarThread) =>
    Number(isUnread(right)) - Number(isUnread(left));
  const grouped: ThreadComparator = (left, right) =>
    compareReadStatus(left, right) || compareThreads(left, right);
  const compareItems = compareThreads.compareItems;
  if (compareItems) {
    grouped.compareItems = (left, right) =>
      (left.kind === "thread" && right.kind === "thread"
        ? compareReadStatus(left.node.thread, right.node.thread)
        : 0) || compareItems(left, right);
  }
  return grouped;
}
