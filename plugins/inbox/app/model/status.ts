import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { PendingInteractionKind } from "../../shared/contract.js";

export type InboxStatus =
  | "approval"
  | "input"
  | "working"
  | "failed"
  | "background"
  | "done"
  | "idle";

export type InboxStatusThread = Pick<
  PluginSidebarThread,
  | "status"
  | "runtimeStatus"
  | "queuedWork"
  | "hasPendingInteraction"
  | "isUnread"
  | "isArchived"
  | "indicator"
  | "activity"
>;

const TURN_RUNTIME_STATUSES: ReadonlySet<PluginSidebarThread["runtimeStatus"]> =
  new Set(["starting", "active", "stopping", "provisioning"]);

const TURN_STATUSES: ReadonlySet<PluginSidebarThread["status"]> = new Set([
  "starting",
  "active",
  "stopping",
]);

export function isTurnInProgress(thread: InboxStatusThread): boolean {
  if (TURN_STATUSES.has(thread.status)) return true;
  if (TURN_RUNTIME_STATUSES.has(thread.runtimeStatus)) return true;
  return thread.status === "pending" && thread.queuedWork === "waiting";
}

export function hasRunningBackgroundCommand(thread: InboxStatusThread): boolean {
  return !thread.isArchived && thread.activity.backgroundCommands > 0;
}

export function deriveInboxStatus(
  thread: InboxStatusThread,
  pendingKind: PendingInteractionKind | null,
): InboxStatus {
  if (thread.hasPendingInteraction) return pendingKind ?? "input";
  if (isTurnInProgress(thread)) return "working";
  if (
    thread.status === "error" ||
    thread.queuedWork === "failed" ||
    thread.indicator === "unread-error"
  ) {
    return "failed";
  }
  if (hasRunningBackgroundCommand(thread)) return "background";
  if (thread.isUnread) return "done";
  return "idle";
}

export function isWorkingStatus(status: InboxStatus): status is "working" {
  return status === "working";
}

export function isActionable(status: InboxStatus): boolean {
  return status === "approval" || status === "input" || status === "failed";
}
