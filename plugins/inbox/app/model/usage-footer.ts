import { z } from "zod";

const USAGE_STATS_PLUGIN_ID = "usage-stats";
export const OPEN_USAGE_COMMAND_ID = `plugin:${USAGE_STATS_PLUGIN_ID}/open-usage`;
export const USAGE_REFRESH_MS = 60_000;
export const HOT_PERCENT = 80;
const PREFERRED_PROVIDER_ID = "claude-code";

export interface UsageMeter {
  label: "5h" | "7d";
  usedPercent: number;
}

const windowSchema = z.object({
  usedPercent: z.number(),
  kind: z.string().optional(),
});

const providerUsageSchema = z.union([
  z.object({ status: z.literal("ok"), windows: z.array(windowSchema) }),
  z.object({ status: z.string() }),
]);

const usageLimitsSchema = z.record(z.string(), providerUsageSchema);

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function selectMeters(limits: unknown): UsageMeter[] {
  const parsed = usageLimitsSchema.safeParse(limits);
  if (!parsed.success) return [];
  const providers = Object.entries(parsed.data).sort(
    ([left], [right]) =>
      Number(right === PREFERRED_PROVIDER_ID) - Number(left === PREFERRED_PROVIDER_ID),
  );
  for (const [, usage] of providers) {
    if (!("windows" in usage)) continue;
    const fiveHour = usage.windows.find((window) => window.kind === "five-hour");
    const weekly = usage.windows.find((window) => window.kind === "weekly");
    if (fiveHour === undefined && weekly === undefined) continue;
    const meters: UsageMeter[] = [];
    if (fiveHour !== undefined) {
      meters.push({ label: "5h", usedPercent: clampPercent(fiveHour.usedPercent) });
    }
    if (weekly !== undefined) {
      meters.push({ label: "7d", usedPercent: clampPercent(weekly.usedPercent) });
    }
    return meters;
  }
  return [];
}
