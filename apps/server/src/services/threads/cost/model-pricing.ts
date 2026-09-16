export interface ModelPrice {
  inputUsdPerMTok: number;
  outputUsdPerMTok: number;
  cacheWriteUsdPerMTok: number;
  cacheReadUsdPerMTok: number;
}

interface ModelPriceEntry {
  pattern: string;
  price: ModelPrice;
}

export interface ProviderPricing {
  inputTokensIncludeCachedTokens: boolean;
  reasoningTokensBilledSeparately: boolean;
  models: readonly ModelPriceEntry[];
}

function anthropicPrice(
  inputUsdPerMTok: number,
  outputUsdPerMTok: number,
  cacheReadUsdPerMTok = inputUsdPerMTok * 0.1,
): ModelPrice {
  return {
    inputUsdPerMTok,
    outputUsdPerMTok,
    cacheWriteUsdPerMTok: inputUsdPerMTok * 1.25,
    cacheReadUsdPerMTok,
  };
}

const ANTHROPIC_MODELS: readonly ModelPriceEntry[] = [
  { pattern: "claude-fable-5-1*", price: anthropicPrice(10, 50, 0.25) },
  { pattern: "claude-mythos-5-1*", price: anthropicPrice(10, 50, 0.25) },
  { pattern: "claude-fable-5*", price: anthropicPrice(10, 50) },
  { pattern: "claude-mythos-5*", price: anthropicPrice(10, 50) },
  { pattern: "claude-opus-5*", price: anthropicPrice(5, 25) },
  { pattern: "claude-opus-4-8*", price: anthropicPrice(5, 25) },
  { pattern: "claude-opus-4-7*", price: anthropicPrice(5, 25) },
  { pattern: "claude-opus-4-6*", price: anthropicPrice(5, 25) },
  { pattern: "claude-opus-4-5*", price: anthropicPrice(5, 25) },
  { pattern: "claude-opus-4*", price: anthropicPrice(15, 75) },
  { pattern: "claude-sonnet-5*", price: anthropicPrice(2, 10) },
  { pattern: "claude-sonnet-4-6*", price: anthropicPrice(3, 15) },
  { pattern: "claude-sonnet-4*", price: anthropicPrice(3, 15) },
  { pattern: "claude-3-7-sonnet*", price: anthropicPrice(3, 15) },
  { pattern: "claude-haiku-4-5*", price: anthropicPrice(1, 5) },
  { pattern: "claude-haiku-4*", price: anthropicPrice(1, 5) },
  { pattern: "claude-3-5-haiku*", price: anthropicPrice(0.8, 4) },
];

const PRICING_BY_PROVIDER: Record<string, ProviderPricing> = {
  "claude-code": {
    inputTokensIncludeCachedTokens: false,
    reasoningTokensBilledSeparately: false,
    models: ANTHROPIC_MODELS,
  },
  codex: {
    inputTokensIncludeCachedTokens: true,
    reasoningTokensBilledSeparately: false,
    models: [],
  },
};

const DEFAULT_PRICING: ProviderPricing = {
  inputTokensIncludeCachedTokens: false,
  reasoningTokensBilledSeparately: false,
  models: [],
};

export function resolveProviderPricing(providerId: string): ProviderPricing {
  return PRICING_BY_PROVIDER[providerId] ?? DEFAULT_PRICING;
}

function matchesPattern(model: string, pattern: string): boolean {
  if (!pattern.endsWith("*")) {
    return model === pattern;
  }
  return model.startsWith(pattern.slice(0, -1));
}

export function resolveModelPrice(
  pricing: ProviderPricing,
  model: string,
): ModelPrice | null {
  for (const entry of pricing.models) {
    if (matchesPattern(model, entry.pattern)) {
      return entry.price;
    }
  }
  return null;
}
