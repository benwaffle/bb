import type { ThreadCost, ThreadCostSource } from "@bb/server-contract";

export function formatThreadCostUsd(totalUsd: number): string {
  if (totalUsd > 0 && totalUsd < 0.01) {
    return "<$0.01";
  }
  return `$${totalUsd.toFixed(2)}`;
}

export function threadCostSourceLabel(source: ThreadCostSource): string {
  switch (source) {
    case "reported":
      return "Reported by the provider";
    case "estimated":
      return "Estimated from token usage";
    case "mixed":
      return "Reported, plus an estimate for the running turn";
  }
}

export function countUnpricedThreadCostModels(cost: ThreadCost): number {
  return cost.models.filter(
    (model) => model.costUsd === null && model.tokens.totalTokens > 0,
  ).length;
}

export function threadCostDetailLabel(cost: ThreadCost): string {
  const unpriced = countUnpricedThreadCostModels(cost);
  if (unpriced > 0 && cost.totalUsd !== null) {
    return unpriced === 1
      ? "Excludes 1 model with no price in the table"
      : `Excludes ${unpriced} models with no price in the table`;
  }
  return threadCostSourceLabel(cost.source);
}

export function hasThreadCostReadout(cost: ThreadCost): boolean {
  return cost.totalUsd !== null || cost.tokens.totalTokens > 0;
}
