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
    { tokens: 1, text: "~1 summary token" },
    { tokens: 842, text: "~842 summary tokens" },
    { tokens: 999, text: "~999 summary tokens" },
    { tokens: 1_000, text: "~1k summary tokens" },
    { tokens: 1_249, text: "~1.2k summary tokens" },
    { tokens: 1_299, text: "~1.2k summary tokens" },
    { tokens: 9_999, text: "~9.9k summary tokens" },
    { tokens: 10_000, text: "~10k summary tokens" },
    { tokens: 128_765, text: "~128k summary tokens" },
  ])("formats $tokens as $text", (example) => {
    expect(formatThinkingTokenEstimate(example.tokens)).toBe(example.text);
  });
});
