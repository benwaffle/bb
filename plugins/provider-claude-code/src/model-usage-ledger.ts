import {
  type ThreadEventModelTokenUsage,
  type ThreadEventTokenUsageBreakdown,
  ZERO_TOKEN_USAGE,
  addTokenUsage,
} from "@get-bb/plugin-sdk/provider-bridge";

export interface ReportedModelUsage {
  model: string;
  breakdown: ThreadEventTokenUsageBreakdown;
  costUsd?: number | undefined;
}

interface ModelLedgerEntry {
  carriedTokens: ThreadEventTokenUsageBreakdown;
  carriedCostUsd: number;
  liveTokens: ThreadEventTokenUsageBreakdown;
  sessionTokens: ThreadEventTokenUsageBreakdown | undefined;
  sessionCostUsd: number | undefined;
  turnTokens: ThreadEventTokenUsageBreakdown;
  unreportedBase: ThreadEventTokenUsageBreakdown;
}

function isZeroUsage(breakdown: ThreadEventTokenUsageBreakdown): boolean {
  return (
    breakdown.totalTokens === 0 &&
    breakdown.inputTokens === 0 &&
    breakdown.cachedInputTokens === 0 &&
    breakdown.outputTokens === 0 &&
    breakdown.reasoningOutputTokens === 0
  );
}

function withObservedReasoningTokens(
  reported: ThreadEventTokenUsageBreakdown,
  observed: ThreadEventTokenUsageBreakdown,
): ThreadEventTokenUsageBreakdown {
  const missing =
    observed.reasoningOutputTokens - reported.reasoningOutputTokens;
  if (missing <= 0) {
    return reported;
  }
  return {
    ...reported,
    totalTokens: reported.totalTokens + missing,
    reasoningOutputTokens: observed.reasoningOutputTokens,
  };
}

export class ModelUsageLedger {
  private readonly entries = new Map<string, ModelLedgerEntry>();

  private entryFor(model: string): ModelLedgerEntry {
    const existing = this.entries.get(model);
    if (existing) return existing;
    const created: ModelLedgerEntry = {
      carriedTokens: ZERO_TOKEN_USAGE,
      carriedCostUsd: 0,
      liveTokens: ZERO_TOKEN_USAGE,
      sessionTokens: undefined,
      sessionCostUsd: undefined,
      turnTokens: ZERO_TOKEN_USAGE,
      unreportedBase: ZERO_TOKEN_USAGE,
    };
    this.entries.set(model, created);
    return created;
  }

  beginTurn(): void {
    for (const entry of this.entries.values()) {
      entry.turnTokens = ZERO_TOKEN_USAGE;
    }
  }

  recordRequest(
    model: string,
    breakdown: ThreadEventTokenUsageBreakdown,
  ): void {
    const entry = this.entryFor(model);
    entry.liveTokens = addTokenUsage(entry.liveTokens, breakdown);
    entry.turnTokens = addTokenUsage(entry.turnTokens, breakdown);
  }

  reconcileTurn(reported: readonly ReportedModelUsage[]): void {
    const reportedByModel = new Map<string, ReportedModelUsage>();
    for (const usage of reported) {
      reportedByModel.set(usage.model, usage);
      this.entryFor(usage.model);
    }
    for (const [model, entry] of this.entries) {
      const usage = reportedByModel.get(model);
      if (usage === undefined) {
        entry.unreportedBase = addTokenUsage(
          entry.unreportedBase,
          entry.turnTokens,
        );
        entry.turnTokens = ZERO_TOKEN_USAGE;
        continue;
      }

      const breakdown = withObservedReasoningTokens(
        usage.breakdown,
        entry.turnTokens,
      );
      const previousSessionTokens = entry.sessionTokens;
      if (
        previousSessionTokens !== undefined &&
        breakdown.totalTokens < previousSessionTokens.totalTokens
      ) {
        entry.carriedTokens = addTokenUsage(
          entry.carriedTokens,
          previousSessionTokens,
        );
        entry.carriedCostUsd += entry.sessionCostUsd ?? 0;
        entry.sessionCostUsd = undefined;
      }
      entry.sessionTokens = breakdown;

      if (usage.costUsd === undefined) {
        entry.unreportedBase = addTokenUsage(
          entry.unreportedBase,
          entry.turnTokens,
        );
      } else {
        entry.sessionCostUsd = usage.costUsd;
      }
      entry.turnTokens = ZERO_TOKEN_USAGE;
    }
  }

  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  snapshot(): ThreadEventModelTokenUsage[] {
    return [...this.entries].map(([model, entry]) => {
      const breakdown =
        entry.sessionTokens === undefined
          ? addTokenUsage(entry.carriedTokens, entry.liveTokens)
          : addTokenUsage(
              addTokenUsage(entry.carriedTokens, entry.sessionTokens),
              entry.turnTokens,
            );
      const reportedCostUsd =
        entry.sessionCostUsd === undefined
          ? entry.carriedCostUsd > 0
            ? entry.carriedCostUsd
            : undefined
          : entry.carriedCostUsd + entry.sessionCostUsd;
      const unreported = addTokenUsage(entry.unreportedBase, entry.turnTokens);
      return {
        model,
        breakdown,
        ...(reportedCostUsd === undefined ? {} : { reportedCostUsd }),
        ...(isZeroUsage(unreported) ? {} : { unreportedBreakdown: unreported }),
      };
    });
  }
}
