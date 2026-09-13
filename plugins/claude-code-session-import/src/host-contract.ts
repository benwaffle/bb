import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const turnRangeSchema = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .strict();

const importedSessionEventSchema = z
  .object({
    at: z.number().int().nonnegative(),
    event: z.unknown(),
  })
  .strict();

const importedSessionTurnSchema = z
  .object({
    at: z.number().int().nonnegative(),
    input: z.array(z.unknown()),
    events: z.array(importedSessionEventSchema),
  })
  .strict();

const claudeSessionSummarySchema = z
  .object({
    sessionId: z.string().min(1),
    sessionPath: z.string().min(1),
    cwd: z.string().nullable(),
    title: z.string().nullable(),
    firstPrompt: z.string().nullable(),
    lastActivityAt: z.number(),
    turnCount: z.number().int().nonnegative(),
    bbDriven: z.boolean(),
  })
  .strict();

export const claudeSessionImportHostContract = defineRpcContract({
  listClaudeSessions: {
    input: z.object({ dir: z.string().min(1).optional() }).strict(),
    output: z
      .object({ sessions: z.array(claudeSessionSummarySchema) })
      .strict(),
  },
  readClaudeSessionTurns: {
    input: z
      .object({
        session: z.string().min(1),
        turns: turnRangeSchema.optional(),
        entropyPrefix: z.string().min(1),
      })
      .strict(),
    output: z
      .object({
        sessionId: z.string().min(1),
        sessionPath: z.string().min(1),
        cwd: z.string().nullable(),
        model: z.string().nullable(),
        title: z.string().nullable(),
        turnCount: z.number().int().min(1),
        turns: turnRangeSchema,
        importedTurns: z.array(importedSessionTurnSchema),
      })
      .strict(),
  },
});
