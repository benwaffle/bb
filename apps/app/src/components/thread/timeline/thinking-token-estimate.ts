const ESTIMATED_CHARACTERS_PER_TOKEN = 4;
const THINKING_TOKEN_COUNT_COMPACT_THRESHOLD = 1_000;
const THINKING_TOKEN_COUNT_FRACTION_LIMIT = 10_000;

const ONE_FRACTION_DIGIT_FORMATTER = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

export function estimateThinkingTokens(textLength: number): number {
  if (textLength <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(textLength / ESTIMATED_CHARACTERS_PER_TOKEN));
}

function formatThinkingTokenNumber(tokens: number): string {
  if (tokens < THINKING_TOKEN_COUNT_COMPACT_THRESHOLD) {
    return String(tokens);
  }
  const thousands = tokens / 1_000;
  if (thousands >= THINKING_TOKEN_COUNT_FRACTION_LIMIT / 1_000) {
    return `${Math.floor(thousands)}k`;
  }
  return `${ONE_FRACTION_DIGIT_FORMATTER.format(Math.floor(thousands * 10) / 10)}k`;
}

export function formatThinkingTokenEstimate(tokens: number): string {
  return `~${formatThinkingTokenNumber(tokens)} ${tokens === 1 ? "summary token" : "summary tokens"}`;
}
