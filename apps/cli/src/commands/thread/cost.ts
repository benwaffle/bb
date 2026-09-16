import { Command } from "commander";
import type { BbSdk } from "@bb/sdk";
import type { ThreadCost, ThreadCostTokens } from "@bb/server-contract";
import { action } from "../../action.js";
import { createCliBbSdk } from "../../client.js";
import {
  getErrorMessage,
  outputJson,
  requireThreadIdOrSelf,
} from "../helpers.js";

function formatUsd(value: number): string {
  return `$${value.toFixed(value > 0 && value < 0.01 ? 4 : 2)}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatThreadCostLine(cost: ThreadCost): string {
  const suffix = cost.source === "reported" ? "" : ` (${cost.source})`;
  if (cost.totalUsd === null) {
    return `${formatCount(cost.tokens.totalTokens)} tokens (no pricing for this provider)`;
  }
  return `${formatUsd(cost.totalUsd)}${suffix}`;
}

export async function fetchThreadCost(args: {
  sdk: BbSdk;
  threadId: string;
  onUnavailable: (message: string) => void;
}): Promise<ThreadCost | null> {
  try {
    const result = await args.sdk.threads.cost({ threadId: args.threadId });
    return result.cost;
  } catch (error) {
    args.onUnavailable(getErrorMessage(error));
    return null;
  }
}

function printTokens(label: string, tokens: ThreadCostTokens): void {
  const cacheRead = Math.max(
    0,
    tokens.cachedInputTokens - tokens.cacheWriteInputTokens,
  );
  console.log(`${label}:`);
  console.log(`  Input:       ${formatCount(tokens.inputTokens)}`);
  console.log(`  Output:      ${formatCount(tokens.outputTokens)}`);
  console.log(`  Cache read:  ${formatCount(cacheRead)}`);
  console.log(`  Cache write: ${formatCount(tokens.cacheWriteInputTokens)}`);
  if (tokens.reasoningOutputTokens > 0) {
    console.log(`  Reasoning:   ${formatCount(tokens.reasoningOutputTokens)}`);
  }
}

export function registerCostCommand(
  parent: Command,
  getUrl: () => string,
): void {
  parent
    .command("cost [id]")
    .description(
      "Show the thread's cost, per-model spend, and per-turn breakdown",
    )
    .option("--self", "Use the current thread")
    .option("--json", "Print machine-readable JSON output")
    .action(
      action(
        async (
          id: string | undefined,
          opts: { self?: boolean; json?: boolean },
        ) => {
          const threadId = requireThreadIdOrSelf(id, opts);
          const result = await createCliBbSdk(getUrl()).threads.cost({
            threadId,
          });
          if (outputJson(opts, result)) return;
          const cost = result.cost;
          if (!cost) {
            console.log("No recorded token usage for this thread yet.");
            return;
          }

          console.log(`Cost: ${formatThreadCostLine(cost)}`);
          printTokens("Tokens", cost.tokens);
          if (cost.models.length > 0) {
            console.log("Models:");
            for (const model of cost.models) {
              const amount =
                model.costUsd === null
                  ? `${formatCount(model.tokens.totalTokens)} tokens`
                  : `${formatUsd(model.costUsd)} (${model.source})`;
              console.log(`  ${model.model}: ${amount}`);
            }
          }
          if (result.turns.length === 0) return;
          console.log(
            result.turnsCoverRetainedWindowOnly
              ? "Turns (retained usage events only):"
              : "Turns:",
          );
          for (const turn of result.turns) {
            const amount =
              turn.costUsd === null
                ? "unknown"
                : `${formatUsd(turn.costUsd)} (${turn.source})`;
            console.log(
              `  ${turn.turnId}: ${amount}, ${formatCount(turn.tokens.totalTokens)} tokens`,
            );
          }
        },
      ),
    );
}
