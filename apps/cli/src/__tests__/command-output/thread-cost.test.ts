import { describe, expect, it, vi } from "vitest";
import {
  collectLogLines,
  setupCommandOutputTestEnvironment,
  runCommand,
  stubServerApi,
} from "../helpers/command-output-harness.js";
import type { CommandRegistrar } from "../helpers/command-output-harness.js";
import { registerThreadCommands } from "../../commands/thread/index.js";

function tokens(overrides: Record<string, number> = {}) {
  return {
    totalTokens: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    ...overrides,
  };
}

describe("bb thread cost", () => {
  setupCommandOutputTestEnvironment();
  const register: CommandRegistrar = (program) =>
    registerThreadCommands(program, () => "http://server");

  it("prints the total, the token split, per-model spend, and per-turn rows", async () => {
    const get = vi.fn(async () => ({
      cost: {
        totalUsd: 1.5,
        source: "mixed",
        tokens: tokens({
          totalTokens: 130_000,
          inputTokens: 5_000,
          cachedInputTokens: 100_000,
          cacheWriteInputTokens: 25_000,
          outputTokens: 25_000,
        }),
        models: [
          {
            model: "claude-opus-5",
            costUsd: 1.5,
            source: "mixed",
            tokens: tokens({ totalTokens: 130_000 }),
          },
        ],
      },
      turns: [
        {
          turnId: "turn-1",
          costUsd: 1.5,
          source: "reported",
          tokens: tokens({ totalTokens: 130_000 }),
        },
      ],
      turnsCoverRetainedWindowOnly: false,
    }));
    stubServerApi({ "v1.threads.:id.cost.$get": get });

    await runCommand(["thread", "cost", "thread-1"], register);

    expect(get).toHaveBeenCalledWith({ param: { id: "thread-1" } });
    const lines = collectLogLines(vi.mocked(console.log));
    expect(lines).toContain("Cost: $1.50 (mixed)");
    expect(lines).toContain("  Cache read:  75,000");
    expect(lines).toContain("  Cache write: 25,000");
    expect(lines).toContain("  claude-opus-5: $1.50 (mixed)");
    expect(lines).toContain("  turn-1: $1.50 (reported), 130,000 tokens");
  });

  it("shows tokens when the provider has no per-token price", async () => {
    stubServerApi({
      "v1.threads.:id.cost.$get": vi.fn(async () => ({
        cost: {
          totalUsd: null,
          source: "estimated",
          tokens: tokens({ totalTokens: 4_200 }),
          models: [],
        },
        turns: [],
        turnsCoverRetainedWindowOnly: false,
      })),
    });

    await runCommand(["thread", "cost", "thread-1"], register);

    expect(collectLogLines(vi.mocked(console.log))).toContain(
      "Cost: 4,200 tokens (no pricing for this provider)",
    );
  });

  it("marks a per-turn list that only covers retained usage events", async () => {
    stubServerApi({
      "v1.threads.:id.cost.$get": vi.fn(async () => ({
        cost: {
          totalUsd: 2,
          source: "reported",
          tokens: tokens({ totalTokens: 10 }),
          models: [],
        },
        turns: [
          {
            turnId: "turn-57",
            costUsd: null,
            source: "reported",
            tokens: tokens({ totalTokens: 10 }),
          },
        ],
        turnsCoverRetainedWindowOnly: true,
      })),
    });

    await runCommand(["thread", "cost", "thread-1"], register);

    const lines = collectLogLines(vi.mocked(console.log));
    expect(lines).toContain("Turns (retained usage events only):");
    expect(lines).toContain("  turn-57: unknown, 10 tokens");
  });

  it("reports missing usage instead of a zero cost", async () => {
    stubServerApi({
      "v1.threads.:id.cost.$get": vi.fn(async () => ({
        cost: null,
        turns: [],
        turnsCoverRetainedWindowOnly: false,
      })),
    });

    await runCommand(["thread", "cost", "thread-1", "--json"], register);

    expect(
      JSON.parse(collectLogLines(vi.mocked(console.log)).join("\n")),
    ).toEqual({
      cost: null,
      turns: [],
      turnsCoverRetainedWindowOnly: false,
    });
  });
});
