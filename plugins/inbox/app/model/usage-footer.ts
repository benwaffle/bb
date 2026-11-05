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

const windowSchema = z.object({
  usedPercent: z.number(),
  kind: z.string().optional(),
  model: z.string().nullable().optional(),
});

const providerUsageSchema = z.union([
  z.object({ status: z.literal("ok"), windows: z.array(windowSchema) }),
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

export function selectMeters(limits: unknown): UsageMeter[] {
  const parsed = usageLimitsSchema.safeParse(limits);
  if (!parsed.success) return [];
  const providers = Object.entries(parsed.data).sort(
    ([left], [right]) =>
      Number(right === PREFERRED_PROVIDER_ID) - Number(left === PREFERRED_PROVIDER_ID),
  );
  for (const [, usage] of providers) {
    if (!("windows" in usage)) continue;
    const meters = providerMeters(usage.windows);
    if (meters.length > 0) return meters;
  }
  return [];
}
