import type {
  ThreadCost,
  ThreadCostModel,
  ThreadCostSource,
  ThreadCostTokens,
  ThreadCostTurn,
  ThreadEventModelTokenUsage,
  ThreadEventTokenUsage,
  ThreadEventTokenUsageBreakdown,
} from "@bb/domain";
import {
  resolveModelPrice,
  resolveProviderPricing,
  type ModelPrice,
  type ProviderPricing,
} from "./model-pricing.js";

export interface ThreadTokenUsageSnapshot {
  turnId: string | null;
  tokenUsage: ThreadEventTokenUsage;
}

export interface ComputeThreadCostArgs {
  providerId: string;
  snapshots: readonly ThreadTokenUsageSnapshot[];
}

export interface ThreadCostBreakdown {
  cost: ThreadCost | null;
  turns: ThreadCostTurn[];
  earlierTurnsMissing: boolean;
}

const ZERO_TOKENS: ThreadCostTokens = {
  totalTokens: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
};

function toCostTokens(
  breakdown: ThreadEventTokenUsageBreakdown,
): ThreadCostTokens {
  return {
    totalTokens: breakdown.totalTokens,
    inputTokens: breakdown.inputTokens,
    cachedInputTokens: breakdown.cachedInputTokens,
    cacheWriteInputTokens: breakdown.cacheWriteInputTokens ?? 0,
    outputTokens: breakdown.outputTokens,
    reasoningOutputTokens: breakdown.reasoningOutputTokens,
  };
}

function hasTokens(tokens: ThreadCostTokens): boolean {
  return (
    tokens.inputTokens > 0 ||
    tokens.cachedInputTokens > 0 ||
    tokens.outputTokens > 0 ||
    tokens.reasoningOutputTokens > 0
  );
}

function priceTokens(
  tokens: ThreadCostTokens,
  price: ModelPrice,
  pricing: ProviderPricing,
): number {
  const cacheWriteTokens = Math.min(
    tokens.cacheWriteInputTokens,
    tokens.cachedInputTokens,
  );
  const cacheReadTokens = tokens.cachedInputTokens - cacheWriteTokens;
  const uncachedInputTokens = pricing.inputTokensIncludeCachedTokens
    ? Math.max(0, tokens.inputTokens - tokens.cachedInputTokens)
    : tokens.inputTokens;
  const billedOutputTokens =
    tokens.outputTokens +
    (pricing.reasoningTokensBilledSeparately
      ? tokens.reasoningOutputTokens
      : 0);

  return (
    (uncachedInputTokens * price.inputUsdPerMTok +
      cacheWriteTokens * price.cacheWriteUsdPerMTok +
      cacheReadTokens * price.cacheReadUsdPerMTok +
      billedOutputTokens * price.outputUsdPerMTok) /
    1_000_000
  );
}

function unreportedTokensFor(
  model: ThreadEventModelTokenUsage,
): ThreadCostTokens {
  if (model.unreportedBreakdown !== undefined) {
    return toCostTokens(model.unreportedBreakdown);
  }
  return model.reportedCostUsd === undefined
    ? toCostTokens(model.breakdown)
    : ZERO_TOKENS;
}

function computeModelCost(
  model: ThreadEventModelTokenUsage,
  pricing: ProviderPricing,
): ThreadCostModel {
  const tokens = toCostTokens(model.breakdown);
  const price = resolveModelPrice(pricing, model.model);
  const unreported = unreportedTokensFor(model);
  const hasUnreported = hasTokens(unreported);
  const estimated =
    price === null || !hasUnreported
      ? null
      : priceTokens(unreported, price, pricing);

  if (model.reportedCostUsd === undefined) {
    return {
      model: model.model,
      costUsd: estimated,
      source: "estimated",
      tokens,
    };
  }
  if (!hasUnreported) {
    return {
      model: model.model,
      costUsd: model.reportedCostUsd,
      source: "reported",
      tokens,
    };
  }
  return {
    model: model.model,
    costUsd: model.reportedCostUsd + (estimated ?? 0),
    source: "mixed",
    tokens,
  };
}

function combineSources(
  sources: readonly ThreadCostSource[],
): ThreadCostSource {
  const unique = new Set(sources);
  if (unique.size === 1) {
    const [only] = [...unique];
    return only;
  }
  return unique.size === 0 ? "estimated" : "mixed";
}

function toThreadCost(
  snapshot: ThreadTokenUsageSnapshot,
  pricing: ProviderPricing,
): ThreadCost {
  const models = (snapshot.tokenUsage.models ?? []).map((model) =>
    computeModelCost(model, pricing),
  );
  const pricedModels = models.filter((model) => model.costUsd !== null);
  const totalUsd =
    pricedModels.length === 0
      ? null
      : pricedModels.reduce((sum, model) => sum + (model.costUsd ?? 0), 0);

  return {
    totalUsd,
    source:
      pricedModels.length === 0
        ? "estimated"
        : pricedModels.length === models.length
          ? combineSources(models.map((model) => model.source))
          : "mixed",
    tokens: toCostTokens(snapshot.tokenUsage.total),
    models,
  };
}

export function computeThreadCost(
  args: ComputeThreadCostArgs,
): ThreadCostBreakdown {
  const pricing = resolveProviderPricing(args.providerId);
  const earliest = args.snapshots[0];
  if (earliest === undefined) {
    return { cost: null, turns: [], earlierTurnsMissing: false };
  }
  const earlierTurnsMissing =
    earliest.tokenUsage.total.totalTokens >
    earliest.tokenUsage.last.totalTokens;

  const latestByTurn = new Map<string, ThreadTokenUsageSnapshot>();
  const turnOrder: string[] = [];
  for (const snapshot of args.snapshots) {
    if (snapshot.turnId === null) continue;
    if (!latestByTurn.has(snapshot.turnId)) {
      turnOrder.push(snapshot.turnId);
    }
    latestByTurn.set(snapshot.turnId, snapshot);
  }

  const turns: ThreadCostTurn[] = [];
  let previousTotalUsd: number | null = earlierTurnsMissing ? null : 0;
  for (const turnId of turnOrder) {
    const snapshot = latestByTurn.get(turnId);
    if (snapshot === undefined) continue;
    const cumulative = toThreadCost(snapshot, pricing);
    const costUsd =
      cumulative.totalUsd === null || previousTotalUsd === null
        ? null
        : Math.max(0, cumulative.totalUsd - previousTotalUsd);
    if (cumulative.totalUsd !== null) {
      previousTotalUsd = cumulative.totalUsd;
    }
    turns.push({
      turnId,
      costUsd,
      source: cumulative.source,
      tokens: toCostTokens(snapshot.tokenUsage.last),
    });
  }

  const latest = args.snapshots[args.snapshots.length - 1];
  return { cost: toThreadCost(latest, pricing), turns, earlierTurnsMissing };
}
