// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ThreadCost, ThreadCostTokens } from "@bb/server-contract";
import { ThreadCostCard } from "./ThreadCostIndicator";

afterEach(cleanup);

function tokens(overrides: Partial<ThreadCostTokens> = {}): ThreadCostTokens {
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

describe("ThreadCostCard", () => {
  it("separates cache reads from cache writes", () => {
    const cost: ThreadCost = {
      totalUsd: 0.23,
      source: "reported",
      tokens: tokens({
        totalTokens: 120_000,
        inputTokens: 2_000,
        cachedInputTokens: 100_000,
        cacheWriteInputTokens: 25_000,
        outputTokens: 18_000,
      }),
      models: [],
    };

    render(<ThreadCostCard cost={cost} />);

    expect(screen.getByText("$0.23")).toBeTruthy();
    const cacheRead = screen.getByText("Cache read").parentElement;
    const cacheWrite = screen.getByText("Cache write").parentElement;
    expect(cacheRead?.textContent).toContain("75k");
    expect(cacheWrite?.textContent).toContain("25k");
  });

  it("shows tokens instead of dollars when the provider has no price", () => {
    const cost: ThreadCost = {
      totalUsd: null,
      source: "estimated",
      tokens: tokens({ totalTokens: 41_000, outputTokens: 1_000 }),
      models: [
        {
          model: "gpt-x",
          costUsd: null,
          source: "estimated",
          tokens: tokens(),
        },
      ],
    };

    render(<ThreadCostCard cost={cost} />);

    expect(screen.getByText("Thread tokens")).toBeTruthy();
    expect(screen.getByText("41k tokens")).toBeTruthy();
  });

  it("lists per-model spend", () => {
    const cost: ThreadCost = {
      totalUsd: 0.5,
      source: "mixed",
      tokens: tokens({ totalTokens: 10 }),
      models: [
        {
          model: "claude-opus-5",
          costUsd: 0.45,
          source: "reported",
          tokens: tokens({ totalTokens: 8 }),
        },
        {
          model: "claude-haiku-4-5",
          costUsd: 0.05,
          source: "estimated",
          tokens: tokens({ totalTokens: 2 }),
        },
      ],
    };

    render(<ThreadCostCard cost={cost} />);

    expect(
      screen.getByText("claude-opus-5").parentElement?.textContent,
    ).toContain("$0.45");
    expect(
      screen.getByText("claude-haiku-4-5").parentElement?.textContent,
    ).toContain("$0.05");
    expect(
      screen.getByText("Reported, plus an estimate for the running turn"),
    ).toBeTruthy();
  });

  it("says so when a model has no price instead of implying a complete total", () => {
    const cost: ThreadCost = {
      totalUsd: 1.2,
      source: "mixed",
      tokens: tokens({ totalTokens: 500 }),
      models: [
        {
          model: "claude-opus-5",
          costUsd: 1.2,
          source: "reported",
          tokens: tokens({ totalTokens: 400 }),
        },
        {
          model: "claude-brand-new",
          costUsd: null,
          source: "estimated",
          tokens: tokens({ totalTokens: 100 }),
        },
      ],
    };

    render(<ThreadCostCard cost={cost} />);

    expect(
      screen.getByText("Excludes 1 model with no price in the table"),
    ).toBeTruthy();
  });

  it("keeps a sub-cent total legible", () => {
    const cost: ThreadCost = {
      totalUsd: 0.004,
      source: "reported",
      tokens: tokens({ totalTokens: 100 }),
      models: [],
    };

    render(<ThreadCostCard cost={cost} />);

    expect(screen.getByText("<$0.01")).toBeTruthy();
  });
});
