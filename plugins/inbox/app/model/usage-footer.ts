import { z } from "zod";

export const USAGE_STATS_PLUGIN_ID = "usage-stats";
export const OPEN_USAGE_COMMAND_ID = `plugin:${USAGE_STATS_PLUGIN_ID}/open-usage`;
export const USAGE_REFRESH_MS = 60_000;
export const HOT_PERCENT = 80;
const PREFERRED_PROVIDER_ID = "claude-code";

export const todayDashboardInput = { days: 1, source: "all", sort: "cost" } as const;

export const todayDashboardSchema = z.object({
  current: z.object({ costUsd: z.number(), tokens: z.number() }),
});

export interface TodayUsage {
  costUsd: number;
  tokens: number;
}

export interface UsageMeter {
  label: "5h" | "7d";
  usedPercent: number;
}

export interface UsageFooterData {
  today: TodayUsage | null;
  meters: UsageMeter[];
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

export function formatUsd(value: number): string {
  if (value < 100) return `$${value.toFixed(2)}`;
  if (value < 10_000) return `$${Math.round(value).toLocaleString("en-US")}`;
  return `$${(value / 1_000).toFixed(1)}k`;
}

const TOKEN_UNITS = [
  { divisor: 1, suffix: "" },
  { divisor: 1_000, suffix: "k" },
  { divisor: 1_000_000, suffix: "M" },
  { divisor: 1_000_000_000, suffix: "B" },
] as const;

function roundScaled(amount: number): number {
  return amount < 10 ? Math.round(amount * 10) / 10 : Math.round(amount);
}

export function formatTokens(value: number): string {
  let index = 0;
  while (
    index < TOKEN_UNITS.length - 1 &&
    roundScaled(value / TOKEN_UNITS[index].divisor) >= 1_000
  ) {
    index += 1;
  }
  const unit = TOKEN_UNITS[index];
  const amount = index === 0 ? Math.round(value) : roundScaled(value / unit.divisor);
  return `${amount}${unit.suffix}`;
}

export function formatToday(today: TodayUsage): string {
  return `Today ${formatUsd(today.costUsd)} · ${formatTokens(today.tokens)} tokens`;
}

export function hasUsage(data: UsageFooterData): boolean {
  return data.today !== null || data.meters.length > 0;
}
