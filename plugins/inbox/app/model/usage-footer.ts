import { z } from "zod";

const USAGE_STATS_PLUGIN_ID = "usage-stats";
export const OPEN_USAGE_COMMAND_ID = `plugin:${USAGE_STATS_PLUGIN_ID}/open-usage`;
export const USAGE_REFRESH_MS = 60_000;
export const HOT_PERCENT = 80;
const PREFERRED_PROVIDER_ID = "claude-code";
const MAX_METERS = 4;

export interface UsageMeter {
  label: string;
  usedPercent: number;
}

export interface UsageCredits {
  used: string;
  limit: string | null;
  usedPercent: number | null;
  detail: string;
}

export interface FooterUsage {
  meters: UsageMeter[];
  credits: UsageCredits | null;
}

const COMPACT_WHOLE_AMOUNT = 100;

const windowSchema = z.object({
  usedPercent: z.number(),
  kind: z.string().optional(),
  model: z.string().nullable().optional(),
});

const creditsSchema = z.object({
  currency: z.string().regex(/^[A-Z]{3}$/),
  decimalPlaces: z.number().int().min(0).max(4),
  usedMinor: z.number().int().nonnegative(),
  limitMinor: z.number().int().positive().nullable(),
});

const providerUsageSchema = z.union([
  z.object({
    status: z.literal("ok"),
    windows: z.array(windowSchema),
    credits: creditsSchema.optional().catch(undefined),
  }),
  z.object({ status: z.string() }),
]);

const usageLimitsSchema = z.record(z.string(), providerUsageSchema);

const WINDOW_SPANS = [
  ["five-hour", "5h"],
  ["weekly", "7d"],
] as const;

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

function modelName(model: string): string {
  return model.charAt(0).toUpperCase() + model.slice(1);
}

function providerMeters(windows: readonly z.infer<typeof windowSchema>[]): UsageMeter[] {
  const overall: UsageMeter[] = [];
  const perModel: UsageMeter[] = [];
  const seen = new Set<string>();
  for (const [kind, span] of WINDOW_SPANS) {
    for (const window of windows) {
      if (window.kind !== kind) continue;
      const model = window.model ?? null;
      const label = model === null ? span : `${modelName(model)} ${span}`;
      if (seen.has(label)) continue;
      seen.add(label);
      (model === null ? overall : perModel).push({
        label,
        usedPercent: clampPercent(window.usedPercent),
      });
    }
  }
  return [...overall, ...perModel].slice(0, MAX_METERS);
}

function formatMoney(
  amount: number,
  currency: string,
  fractionDigits: number,
): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}

function compactMoney(amount: number, currency: string, decimalPlaces: number): string {
  const whole = amount >= COMPACT_WHOLE_AMOUNT || Number.isInteger(amount);
  return formatMoney(amount, currency, whole ? 0 : decimalPlaces);
}

function footerCredits(credits: z.infer<typeof creditsSchema>): UsageCredits {
  const scale = 10 ** credits.decimalPlaces;
  const used = credits.usedMinor / scale;
  const limit = credits.limitMinor === null ? null : credits.limitMinor / scale;
  const exact = (amount: number) =>
    formatMoney(amount, credits.currency, credits.decimalPlaces);
  const usedPercent =
    credits.limitMinor === null
      ? null
      : clampPercent((credits.usedMinor / credits.limitMinor) * 100);
  return {
    used: compactMoney(used, credits.currency, credits.decimalPlaces),
    limit:
      limit === null ? null : compactMoney(limit, credits.currency, credits.decimalPlaces),
    usedPercent,
    detail:
      limit === null
        ? `Usage credits this month: ${exact(used)}, no monthly limit`
        : `Usage credits this month: ${exact(used)} of ${exact(limit)} (${usedPercent}%)`,
  };
}

export function selectUsage(limits: unknown): FooterUsage {
  const parsed = usageLimitsSchema.safeParse(limits);
  if (!parsed.success) return { meters: [], credits: null };
  const providers = Object.entries(parsed.data).sort(
    ([left], [right]) =>
      Number(right === PREFERRED_PROVIDER_ID) - Number(left === PREFERRED_PROVIDER_ID),
  );
  for (const [, usage] of providers) {
    if (!("windows" in usage)) continue;
    const meters = providerMeters(usage.windows);
    const credits = usage.credits === undefined ? null : footerCredits(usage.credits);
    if (meters.length > 0 || credits !== null) return { meters, credits };
  }
  return { meters: [], credits: null };
}
