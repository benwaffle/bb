import { listThreadTokenUsageRows, type DbConnection } from "@bb/db";
import { decodeStoredEventRowCached } from "../stored-event-decode-cache.js";
import {
  computeThreadCost,
  type ThreadCostBreakdown,
  type ThreadTokenUsageSnapshot,
} from "./thread-cost.js";

export const THREAD_COST_USAGE_ROW_LIMIT = 200;

export interface LoadThreadCostArgs {
  providerId: string;
  threadId: string;
}

export function loadThreadCost(
  db: DbConnection,
  args: LoadThreadCostArgs,
): ThreadCostBreakdown & { coversRetainedWindowOnly: boolean } {
  const rows = listThreadTokenUsageRows(db, {
    threadId: args.threadId,
    limit: THREAD_COST_USAGE_ROW_LIMIT,
  });
  const snapshots: ThreadTokenUsageSnapshot[] = [];
  for (const row of rows) {
    const event = decodeStoredEventRowCached(db, row);
    if (event.type !== "thread/tokenUsage/updated") continue;
    snapshots.push({ turnId: row.turnId, tokenUsage: event.tokenUsage });
  }

  const breakdown = computeThreadCost({
    providerId: args.providerId,
    snapshots,
  });

  return {
    ...breakdown,
    coversRetainedWindowOnly:
      rows.length >= THREAD_COST_USAGE_ROW_LIMIT ||
      breakdown.earlierTurnsMissing,
  };
}
