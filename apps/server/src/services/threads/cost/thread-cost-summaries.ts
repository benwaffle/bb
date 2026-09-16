import {
  listLatestTokenUsageByThreadIds,
  type DbQueryConnection,
} from "@bb/db";
import {
  threadEventTokenUsageSchema,
  type ThreadCostSummary,
  type ThreadEventTokenUsage,
} from "@bb/domain";
import { computeThreadCost } from "./thread-cost.js";

function parseTokenUsageJson(
  value: string | null,
): ThreadEventTokenUsage | null {
  if (value === null) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(value);
  } catch {
    return null;
  }
  const parsed = threadEventTokenUsageSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export interface BuildThreadCostSummariesArgs {
  threads: readonly { id: string; providerId: string }[];
}

export function buildThreadCostSummaryByThreadId(
  db: DbQueryConnection,
  args: BuildThreadCostSummariesArgs,
): Map<string, ThreadCostSummary> {
  const providerIdByThreadId = new Map(
    args.threads.map((thread) => [thread.id, thread.providerId]),
  );
  const rows = listLatestTokenUsageByThreadIds(db, {
    threadIds: [...providerIdByThreadId.keys()],
  });
  const summaries = new Map<string, ThreadCostSummary>();
  for (const row of rows) {
    const providerId = providerIdByThreadId.get(row.threadId);
    if (providerId === undefined) continue;
    const tokenUsage = parseTokenUsageJson(row.tokenUsage);
    if (tokenUsage === null) continue;
    const { cost } = computeThreadCost({
      providerId,
      snapshots: [{ turnId: null, tokenUsage }],
    });
    if (cost === null) continue;
    summaries.set(row.threadId, {
      totalUsd: cost.totalUsd,
      totalTokens: cost.tokens.totalTokens,
      source: cost.source,
    });
  }
  return summaries;
}
