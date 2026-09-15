import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { SESSION_HIDDEN_REASONS } from "./session-visibility.js";

const machineChoiceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    connected: z.boolean(),
  })
  .strict();

const sessionEntrySchema = z
  .object({
    sessionId: z.string().min(1),
    sessionPath: z.string().min(1),
    cwd: z.string().nullable(),
    title: z.string().nullable(),
    firstPrompt: z.string().nullable(),
    lastActivityAt: z.number(),
    turnCount: z.number().int().nonnegative(),
    bbDriven: z.boolean(),
    projectId: z.string().nullable(),
    projectName: z.string().nullable(),
    hiddenReason: z.enum(SESSION_HIDDEN_REASONS).nullable(),
  })
  .strict();

const projectChoiceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    kind: z.enum(["standard", "personal"]),
  })
  .strict();

export const claudeSessionImportRpcContract = defineRpcContract({
  listSessions: {
    input: z
      .object({
        machine: z.string().min(1).nullable(),
        dir: z.string().min(1).nullable(),
      })
      .strict(),
    output: z
      .object({
        machine: machineChoiceSchema,
        machines: z.array(machineChoiceSchema),
        projects: z.array(projectChoiceSchema),
        sessions: z.array(sessionEntrySchema),
      })
      .strict(),
  },
  importSession: {
    input: z
      .object({
        sessionId: z.string().min(1),
        machine: z.string().min(1),
        projectId: z.string().min(1).nullable(),
      })
      .strict(),
    output: z
      .object({
        threadId: z.string().min(1),
        title: z.string().nullable(),
        turnCount: z.number().int().nonnegative(),
      })
      .strict(),
  },
});
