import type { ThreadContextWindowUsage } from "@bb/server-contract";
import { formatContextWindowTokens } from "@bb/thread-view";
import { formatRelativeTime } from "@/lib/relative-time";

export { formatContextWindowReadout } from "@bb/thread-view";

export function calculateContextWindowUsagePercent(
  usage: ThreadContextWindowUsage,
): number {
  if (usage.modelContextWindow <= 0) return 0;
  const ratio = usage.usedTokens / usage.modelContextWindow;
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clampedRatio * 100);
}

export function formatCompactTokenCount(value: number): string {
  return formatContextWindowTokens(value);
}

export function formatUsageCost(cost: {
  amount: number;
  currency: string;
}): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cost.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: cost.amount < 1 ? 4 : 2,
    }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
}

export function formatContextSnapshotAge(
  usage: ThreadContextWindowUsage,
  now: number,
): string | null {
  const snapshot = usage.snapshot;
  if (!snapshot || snapshot.usedTokens === usage.usedTokens) return null;
  const capturedAt = Date.parse(snapshot.capturedAt);
  if (!Number.isFinite(capturedAt)) return "As of last turn";
  const minutes = Math.floor((now - capturedAt) / 60_000);
  const age =
    minutes >= 1 && minutes < 60
      ? `${minutes} min ago`
      : formatRelativeTime({ timestamp: capturedAt, now });
  return `As of last turn, ${age}`;
}
