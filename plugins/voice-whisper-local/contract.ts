import { defineRpcContract } from "@get-bb/plugin-sdk";
import { experimental_aiServicesHostContract } from "@get-bb/plugin-sdk/ai-services";
import { z } from "zod";

export const WHISPER_SERVICE_ID = "whisper";

export const whisperModelNameSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9.-]{0,63}$/,
    "Model names use lowercase letters, digits, dots, and dashes, like base.en",
  );

export type WhisperModelName = z.infer<typeof whisperModelNameSchema>;

const installedModelSchema = z
  .object({
    name: whisperModelNameSchema,
    path: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
  })
  .strict();

export type InstalledModel = z.infer<typeof installedModelSchema>;

export const whisperStatusSchema = z
  .object({
    whisperCli: z.string().nullable(),
    ffmpeg: z.string().nullable(),
    modelDir: z.string().min(1),
    models: z.array(installedModelSchema),
  })
  .strict();

export type WhisperStatus = z.infer<typeof whisperStatusSchema>;

export const prepareModelInputSchema = z
  .object({ model: whisperModelNameSchema })
  .strict();

export const prepareModelOutputSchema = z
  .object({
    model: installedModelSchema,
    downloaded: z.boolean(),
    warmupMs: z.number().int().nonnegative(),
  })
  .strict();

export type PrepareModelOutput = z.infer<typeof prepareModelOutputSchema>;

export const whisperHostContract = defineRpcContract({
  ...experimental_aiServicesHostContract,
  status: {
    input: z.null(),
    output: whisperStatusSchema,
  },
  prepareModel: {
    input: prepareModelInputSchema,
    output: prepareModelOutputSchema,
  },
});
