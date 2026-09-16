import { z } from "zod";

export const threadCostTokensSchema = z.object({
  totalTokens: z.number(),
  inputTokens: z.number(),
  cachedInputTokens: z.number(),
  cacheWriteInputTokens: z.number(),
  outputTokens: z.number(),
  reasoningOutputTokens: z.number(),
});
export type ThreadCostTokens = z.infer<typeof threadCostTokensSchema>;

export const threadCostSourceValues = [
  "reported",
  "estimated",
  "mixed",
] as const;
export const threadCostSourceSchema = z.enum(threadCostSourceValues);
export type ThreadCostSource = z.infer<typeof threadCostSourceSchema>;

export const threadCostSummarySchema = z.object({
  totalUsd: z.number().nullable(),
  totalTokens: z.number(),
  source: threadCostSourceSchema,
});
export type ThreadCostSummary = z.infer<typeof threadCostSummarySchema>;

export const threadCostModelSchema = z.object({
  model: z.string(),
  costUsd: z.number().nullable(),
  source: threadCostSourceSchema,
  tokens: threadCostTokensSchema,
});
export type ThreadCostModel = z.infer<typeof threadCostModelSchema>;

export const threadCostTurnSchema = z.object({
  turnId: z.string(),
  costUsd: z.number().nullable(),
  source: threadCostSourceSchema,
  tokens: threadCostTokensSchema,
});
export type ThreadCostTurn = z.infer<typeof threadCostTurnSchema>;

export const threadCostSchema = z.object({
  totalUsd: z.number().nullable(),
  source: threadCostSourceSchema,
  tokens: threadCostTokensSchema,
  models: z.array(threadCostModelSchema),
});
export type ThreadCost = z.infer<typeof threadCostSchema>;
