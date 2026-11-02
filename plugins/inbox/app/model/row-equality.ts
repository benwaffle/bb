import type { InboxThreadState } from "../../shared/inbox-state.js";
import type {
  InboxEntry,
  InboxGroupNode,
  InboxNode,
  InboxThreadNode,
} from "./layout.js";

function sameParked(
  left: InboxThreadState | null,
  right: InboxThreadState | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  return (
    left.settledAt === right.settledAt && left.snoozeUntil === right.snoozeUntil
  );
}

function sameEntry(left: InboxEntry, right: InboxEntry): boolean {
  return (
    left.thread === right.thread &&
    left.status === right.status &&
    left.section === right.section &&
    left.returnAt === right.returnAt &&
    left.workingSince === right.workingSince &&
    sameParked(left.parked, right.parked)
  );
}

export function sameThreadNode(
  left: InboxThreadNode,
  right: InboxThreadNode,
): boolean {
  if (left === right) return true;
  if (!sameEntry(left.entry, right.entry)) return false;
  if (left.detachedFrom?.id !== right.detachedFrom?.id) return false;
  if (left.detachedFrom?.title !== right.detachedFrom?.title) return false;
  if (left.children.length !== right.children.length) return false;
  return left.children.every((child, index) =>
    sameThreadNode(child, right.children[index]!),
  );
}

export function sameGroupNode(
  left: InboxGroupNode,
  right: InboxGroupNode,
): boolean {
  if (left === right) return true;
  if (left.group !== right.group) return false;
  if (left.rows.length !== right.rows.length) return false;
  if (left.placeholders.length !== right.placeholders.length) return false;
  return (
    left.placeholders.every(
      (placeholder, index) => placeholder === right.placeholders[index],
    ) && left.rows.every((row, index) => sameThreadNode(row, right.rows[index]!))
  );
}

export function nodeContainsThread(node: InboxNode, threadId: string): boolean {
  if (node.kind === "group") {
    return node.rows.some((row) => nodeContainsThread(row, threadId));
  }
  if (node.entry.thread.id === threadId) return true;
  return node.children.some((child) => nodeContainsThread(child, threadId));
}

export function activeChangeAffects(
  node: InboxNode,
  previousActiveId: string | null,
  nextActiveId: string | null,
): boolean {
  if (previousActiveId === nextActiveId) return false;
  return (
    (previousActiveId !== null && nodeContainsThread(node, previousActiveId)) ||
    (nextActiveId !== null && nodeContainsThread(node, nextActiveId))
  );
}
