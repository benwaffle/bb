import { describe, expect, it } from "vitest";
import {
  estimateThinkingTokens,
  formatThinkingTokenEstimate,
} from "./thinking-token-estimate.js";

describe("estimateThinkingTokens", () => {
  it.each([
    { textLength: 0, tokens: 0 },
    { textLength: 1, tokens: 1 },
    { textLength: 3_368, tokens: 842 },
    { textLength: 4_802, tokens: 1_201 },
  ])("estimates $tokens tokens from $textLength characters", (example) => {
    expect(estimateThinkingTokens(example.textLength)).toBe(example.tokens);
  });
});

describe("formatThinkingTokenEstimate", () => {
  it.each([
    { tokens: 1, text: "~1 token" },
    { tokens: 842, text: "~842 tokens" },
    { tokens: 999, text: "~999 tokens" },
    { tokens: 1_000, text: "~1k tokens" },
    { tokens: 1_249, text: "~1.2k tokens" },
    { tokens: 1_299, text: "~1.2k tokens" },
    { tokens: 9_999, text: "~9.9k tokens" },
    { tokens: 10_000, text: "~10k tokens" },
    { tokens: 128_765, text: "~128k tokens" },
  ])("formats $tokens as $text", (example) => {
    expect(formatThinkingTokenEstimate(example.tokens)).toBe(example.text);
  });
});
