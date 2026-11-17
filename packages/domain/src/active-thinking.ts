import { z } from "zod";

export interface ActiveThinking {
  id: string;
  text: string;
  textLength: number;
  startedAt: number;
  updatedAt: number;
}

export const activeThinkingSchema = z.object({
  id: z.string(),
  text: z.string(),
  textLength: z.number().int().nonnegative(),
  startedAt: z.number(),
  updatedAt: z.number(),
});
