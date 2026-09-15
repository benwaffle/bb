import type { ThreadContextWindowUsage } from "@bb/server-contract";
import { formatContextWindowTokens } from "@bb/thread-view";

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
