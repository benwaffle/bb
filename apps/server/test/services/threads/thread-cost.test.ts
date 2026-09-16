import { describe, expect, it } from "vitest";
import type {
  ThreadEventModelTokenUsage,
  ThreadEventTokenUsageBreakdown,
} from "@bb/domain";
import { computeThreadCost } from "../../../src/services/threads/cost/thread-cost.js";
import {
  resolveModelPrice,
  resolveProviderPricing,
} from "../../../src/services/threads/cost/model-pricing.js";

function breakdown(
  overrides: Partial<ThreadEventTokenUsageBreakdown> = {},
): ThreadEventTokenUsageBreakdown {
  const base = {
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    ...overrides,
  };
  return {
    ...base,
    totalTokens:
      overrides.totalTokens ??
      base.inputTokens + base.cachedInputTokens + base.outputTokens,
  };
}

function snapshot(args: {
  turnId?: string | null;
  models?: ThreadEventModelTokenUsage[];
  total?: ThreadEventTokenUsageBreakdown;
  last?: ThreadEventTokenUsageBreakdown;
}) {
  return {
    turnId: args.turnId ?? "turn-1",
    tokenUsage: {
      total: args.total ?? breakdown(),
      last: args.last ?? breakdown(),
      modelContextWindow: 200_000,
      ...(args.models === undefined ? {} : { models: args.models }),
    },
  };
}

describe("thread cost pricing", () => {
  it("prices cache writes above cache reads", () => {
    const pricing = resolveProviderPricing("claude-code");
    const price = resolveModelPrice(pricing, "claude-opus-5");
    expect(price).not.toBeNull();
    expect(price?.cacheWriteUsdPerMTok).toBeCloseTo(6.25);
    expect(price?.cacheReadUsdPerMTok).toBeCloseTo(0.5);
  });

  it("estimates an in-flight turn from per-model tokens", () => {
    const { cost } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({
                inputTokens: 1_000_000,
                outputTokens: 1_000_000,
                cachedInputTokens: 2_000_000,
                cacheWriteInputTokens: 1_000_000,
              }),
              unreportedBreakdown: breakdown({
                inputTokens: 1_000_000,
                outputTokens: 1_000_000,
                cachedInputTokens: 2_000_000,
                cacheWriteInputTokens: 1_000_000,
              }),
            },
          ],
        }),
      ],
    });

    expect(cost?.source).toBe("estimated");
    expect(cost?.totalUsd).toBeCloseTo(5 + 25 + 6.25 + 0.5);
  });

  it("prefers the provider-reported cost once a turn is reconciled", () => {
    const { cost } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({
                inputTokens: 1_000_000,
                outputTokens: 1_000_000,
              }),
              reportedCostUsd: 1.23,
            },
          ],
        }),
      ],
    });

    expect(cost).toMatchObject({ totalUsd: 1.23, source: "reported" });
  });

  it("adds an estimate for the in-flight turn on top of reported turns", () => {
    const { cost } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({
                inputTokens: 1_000_000,
                outputTokens: 2_000_000,
              }),
              reportedCostUsd: 1,
              unreportedBreakdown: breakdown({ outputTokens: 1_000_000 }),
            },
          ],
        }),
      ],
    });

    expect(cost?.source).toBe("mixed");
    expect(cost?.totalUsd).toBeCloseTo(26);
  });

  it("reports tokens without dollars when the provider has no pricing", () => {
    const { cost } = computeThreadCost({
      providerId: "codex",
      snapshots: [
        snapshot({
          total: breakdown({ inputTokens: 500, outputTokens: 20 }),
          models: [
            {
              model: "gpt-x",
              breakdown: breakdown({ inputTokens: 500, outputTokens: 20 }),
            },
          ],
        }),
      ],
    });

    expect(cost?.totalUsd).toBeNull();
    expect(cost?.tokens).toMatchObject({ inputTokens: 500, outputTokens: 20 });
  });

  it("reports no priced models when the provider sends no model attribution", () => {
    const { cost } = computeThreadCost({
      providerId: "codex",
      snapshots: [
        snapshot({ total: breakdown({ inputTokens: 10, outputTokens: 2 }) }),
      ],
    });

    expect(cost).toMatchObject({ totalUsd: null, models: [] });
  });

  it("derives per-turn cost by differencing the cumulative totals", () => {
    const { turns } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          turnId: "turn-1",
          last: breakdown({ outputTokens: 100 }),
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 100 }),
              reportedCostUsd: 0.5,
            },
          ],
        }),
        snapshot({
          turnId: "turn-2",
          last: breakdown({ outputTokens: 300 }),
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 400 }),
              reportedCostUsd: 1.25,
            },
          ],
        }),
      ],
    });

    expect(turns).toEqual([
      expect.objectContaining({ turnId: "turn-1", costUsd: 0.5 }),
      expect.objectContaining({ turnId: "turn-2", costUsd: 0.75 }),
    ]);
    expect(turns[1].tokens.outputTokens).toBe(300);
  });

  it("keeps only the last usage snapshot of each turn", () => {
    const { turns } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          turnId: "turn-1",
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 100 }),
              reportedCostUsd: 0.25,
            },
          ],
        }),
        snapshot({
          turnId: "turn-1",
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 200 }),
              reportedCostUsd: 0.5,
            },
          ],
        }),
      ],
    });

    expect(turns).toEqual([
      expect.objectContaining({ turnId: "turn-1", costUsd: 0.5 }),
    ]);
  });

  it("leaves the oldest retained turn unpriced when earlier turns were pruned", () => {
    const { turns, earlierTurnsMissing } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          turnId: "turn-57",
          total: breakdown({ outputTokens: 1_000 }),
          last: breakdown({ outputTokens: 100 }),
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 1_000 }),
              reportedCostUsd: 12.4,
            },
          ],
        }),
        snapshot({
          turnId: "turn-58",
          total: breakdown({ outputTokens: 1_200 }),
          last: breakdown({ outputTokens: 200 }),
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 1_200 }),
              reportedCostUsd: 13.4,
            },
          ],
        }),
      ],
    });

    expect(earlierTurnsMissing).toBe(true);
    expect(turns).toEqual([
      expect.objectContaining({ turnId: "turn-57", costUsd: null }),
      expect.objectContaining({ turnId: "turn-58", costUsd: 1 }),
    ]);
  });

  it("treats a first turn with several requests as complete history", () => {
    const { earlierTurnsMissing, turns } = computeThreadCost({
      providerId: "claude-code",
      snapshots: [
        snapshot({
          turnId: "turn-1",
          total: breakdown({ outputTokens: 100 }),
          last: breakdown({ outputTokens: 100 }),
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 100 }),
              unreportedBreakdown: breakdown({ outputTokens: 100 }),
            },
          ],
        }),
        snapshot({
          turnId: "turn-1",
          total: breakdown({ outputTokens: 300 }),
          last: breakdown({ outputTokens: 200 }),
          models: [
            {
              model: "claude-opus-5",
              breakdown: breakdown({ outputTokens: 300 }),
              reportedCostUsd: 2,
            },
          ],
        }),
      ],
    });

    expect(earlierTurnsMissing).toBe(false);
    expect(turns).toEqual([
      expect.objectContaining({ turnId: "turn-1", costUsd: 2 }),
    ]);
  });

  it("does not claim a cost source when nothing is priced", () => {
    const { cost } = computeThreadCost({
      providerId: "codex",
      snapshots: [
        snapshot({
          models: [
            { model: "gpt-x", breakdown: breakdown({ outputTokens: 10 }) },
          ],
        }),
      ],
    });

    expect(cost).toMatchObject({ totalUsd: null, source: "estimated" });
  });

  it("prices codex input tokens net of the cached share", () => {
    const pricing = resolveProviderPricing("codex");
    expect(pricing.inputTokensIncludeCachedTokens).toBe(true);
  });
});
