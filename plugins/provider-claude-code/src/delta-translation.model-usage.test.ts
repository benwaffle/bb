import { describe, expect, it } from "vitest";
import type { ThreadEvent } from "@bb/domain";
import { createClaudeDeltaHarness } from "./delta-test-harness.js";

type TokenUsageEvent = Extract<
  ThreadEvent,
  { type: "thread/tokenUsage/updated" }
>;

function tokenUsageEvents(events: readonly ThreadEvent[]): TokenUsageEvent[] {
  return events.filter(
    (event): event is TokenUsageEvent =>
      event.type === "thread/tokenUsage/updated",
  );
}

function assistantMessage(args: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheRead?: number;
  cacheCreation?: number;
}): Record<string, unknown> {
  return {
    type: "assistant",
    message: {
      type: "message",
      role: "assistant",
      model: args.model,
      content: [],
      usage: {
        input_tokens: args.inputTokens,
        output_tokens: args.outputTokens,
        cache_read_input_tokens: args.cacheRead ?? 0,
        cache_creation_input_tokens: args.cacheCreation ?? 0,
      },
    },
  };
}

function resultMessage(args: {
  usage: Record<string, number>;
  modelUsage?: Record<string, Record<string, number>>;
}): Record<string, unknown> {
  return {
    type: "result",
    subtype: "success",
    duration_ms: 1,
    duration_api_ms: 1,
    is_error: false,
    num_turns: 1,
    result: "ok",
    stop_reason: "end_turn",
    usage: args.usage,
    ...(args.modelUsage === undefined ? {} : { modelUsage: args.modelUsage }),
    session_id: "session-1",
  };
}

describe("claude per-model usage and cost carrier", () => {
  it("emits live per-model usage on each top-level assistant message", () => {
    const harness = createClaudeDeltaHarness();

    const first = tokenUsageEvents(
      harness.translate(
        assistantMessage({
          model: "claude-opus-5",
          inputTokens: 10,
          outputTokens: 100,
          cacheRead: 5_000,
          cacheCreation: 2_000,
        }),
      ),
    );

    expect(first).toHaveLength(1);
    expect(first[0].tokenUsage.total).toMatchObject({
      inputTokens: 10,
      outputTokens: 100,
      cachedInputTokens: 7_000,
      cacheWriteInputTokens: 2_000,
    });
    expect(first[0].tokenUsage.models).toEqual([
      {
        model: "claude-opus-5",
        breakdown: expect.objectContaining({
          inputTokens: 10,
          outputTokens: 100,
          cacheWriteInputTokens: 2_000,
        }),
        unreportedBreakdown: expect.objectContaining({ outputTokens: 100 }),
      },
    ]);

    const second = tokenUsageEvents(
      harness.translate(
        assistantMessage({
          model: "claude-opus-5",
          inputTokens: 4,
          outputTokens: 50,
          cacheRead: 7_000,
        }),
      ),
    );

    expect(second[0].tokenUsage.total).toMatchObject({
      inputTokens: 14,
      outputTokens: 150,
    });
    expect(second[0].tokenUsage.models?.[0].breakdown).toMatchObject({
      inputTokens: 14,
      outputTokens: 150,
    });
  });

  it("tracks nested subagent spend under its own model without an event per message", () => {
    const harness = createClaudeDeltaHarness();

    harness.translate(
      assistantMessage({
        model: "claude-opus-5",
        inputTokens: 10,
        outputTokens: 20,
      }),
    );
    const nested = tokenUsageEvents(
      harness.translate(
        assistantMessage({
          model: "claude-haiku-4-5",
          inputTokens: 5,
          outputTokens: 10,
        }),
        { parentToolCallId: "toolu_parent" },
      ),
    );
    expect(nested).toHaveLength(0);

    const nestedLarge = tokenUsageEvents(
      harness.translate(
        assistantMessage({
          model: "claude-haiku-4-5",
          inputTokens: 5,
          outputTokens: 10,
          cacheRead: 30_000,
        }),
        { parentToolCallId: "toolu_parent" },
      ),
    );
    expect(nestedLarge).toHaveLength(1);
    expect(nestedLarge[0].tokenUsage.models).toEqual([
      expect.objectContaining({ model: "claude-opus-5" }),
      expect.objectContaining({
        model: "claude-haiku-4-5",
        breakdown: expect.objectContaining({ outputTokens: 20 }),
      }),
    ]);
  });

  it("reconciles to the provider-reported per-model cost at the end of a turn", () => {
    const harness = createClaudeDeltaHarness();

    harness.translate(
      assistantMessage({
        model: "claude-opus-5",
        inputTokens: 10,
        outputTokens: 100,
        cacheRead: 5_000,
      }),
    );
    const events = tokenUsageEvents(
      harness.translate(
        resultMessage({
          usage: {
            input_tokens: 12,
            output_tokens: 120,
            cache_read_input_tokens: 5_000,
            cache_creation_input_tokens: 400,
          },
          modelUsage: {
            "claude-opus-5": {
              inputTokens: 12,
              outputTokens: 120,
              cacheReadInputTokens: 5_000,
              cacheCreationInputTokens: 400,
              costUSD: 0.25,
              contextWindow: 200_000,
            },
          },
        }),
      ),
    );

    expect(events).toHaveLength(1);
    expect(events[0].tokenUsage.total).toMatchObject({
      inputTokens: 12,
      outputTokens: 120,
    });
    expect(events[0].tokenUsage.models).toEqual([
      {
        model: "claude-opus-5",
        breakdown: expect.objectContaining({
          inputTokens: 12,
          outputTokens: 120,
          cacheWriteInputTokens: 400,
        }),
        reportedCostUsd: 0.25,
      },
    ]);
  });

  it("treats the reported per-model usage as session-cumulative, not per-turn", () => {
    const harness = createClaudeDeltaHarness();
    const turn = (cumulative: { tokens: number; costUsd: number }) => {
      harness.translate(
        assistantMessage({
          model: "claude-opus-5",
          inputTokens: 10,
          outputTokens: 100,
        }),
      );
      return tokenUsageEvents(
        harness.translate(
          resultMessage({
            usage: { input_tokens: 10, output_tokens: 100 },
            modelUsage: {
              "claude-opus-5": {
                inputTokens: 10,
                outputTokens: cumulative.tokens,
                costUSD: cumulative.costUsd,
                contextWindow: 200_000,
              },
            },
          }),
        ),
      );
    };

    turn({ tokens: 100, costUsd: 0.1 });
    turn({ tokens: 200, costUsd: 0.2 });
    const third = turn({ tokens: 300, costUsd: 0.3 });

    expect(third[0].tokenUsage.models).toEqual([
      {
        model: "claude-opus-5",
        breakdown: expect.objectContaining({ outputTokens: 300 }),
        reportedCostUsd: 0.3,
      },
    ]);
  });

  it("carries earlier spend when the provider session counter restarts", () => {
    const harness = createClaudeDeltaHarness();
    const turn = (cumulative: { tokens: number; costUsd: number }) => {
      harness.translate(
        assistantMessage({
          model: "claude-opus-5",
          inputTokens: 10,
          outputTokens: 100,
        }),
      );
      return tokenUsageEvents(
        harness.translate(
          resultMessage({
            usage: { input_tokens: 10, output_tokens: 100 },
            modelUsage: {
              "claude-opus-5": {
                inputTokens: 10,
                outputTokens: cumulative.tokens,
                costUSD: cumulative.costUsd,
                contextWindow: 200_000,
              },
            },
          }),
        ),
      );
    };

    turn({ tokens: 500, costUsd: 4 });
    const afterRestart = turn({ tokens: 40, costUsd: 0.25 });

    expect(afterRestart[0].tokenUsage.models).toEqual([
      {
        model: "claude-opus-5",
        breakdown: expect.objectContaining({ outputTokens: 540 }),
        reportedCostUsd: 4.25,
      },
    ]);
  });

  it("keeps tokens from a turn that ends without a result message", () => {
    const harness = createClaudeDeltaHarness();

    harness.translate(
      assistantMessage({
        model: "claude-opus-5",
        inputTokens: 10,
        outputTokens: 100,
      }),
    );
    harness.settleSession();

    const next = tokenUsageEvents(
      harness.translate(
        assistantMessage({
          model: "claude-opus-5",
          inputTokens: 5,
          outputTokens: 50,
        }),
      ),
    );

    expect(next[0].tokenUsage.total).toMatchObject({
      inputTokens: 15,
      outputTokens: 150,
    });
  });

  it("keeps a turn estimable when the provider reports no cost", () => {
    const harness = createClaudeDeltaHarness();

    harness.translate(
      assistantMessage({
        model: "claude-opus-5",
        inputTokens: 10,
        outputTokens: 100,
      }),
    );
    const events = tokenUsageEvents(
      harness.translate(
        resultMessage({ usage: { input_tokens: 10, output_tokens: 100 } }),
      ),
    );

    expect(events[0].tokenUsage.models).toEqual([
      {
        model: "claude-opus-5",
        breakdown: expect.objectContaining({ outputTokens: 100 }),
        unreportedBreakdown: expect.objectContaining({ outputTokens: 100 }),
      },
    ]);
  });
});
