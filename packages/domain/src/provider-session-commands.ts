import { z } from "zod";

export const PROVIDER_SESSION_COMMANDS_MAX = 400;

export const providerSessionCommandSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  argumentHint: z.string().nullable(),
  aliases: z.array(z.string().min(1)),
});
export type ProviderSessionCommand = z.infer<
  typeof providerSessionCommandSchema
>;

export const providerSessionCommandsStateSchema = z.object({
  commands: z
    .array(providerSessionCommandSchema)
    .max(PROVIDER_SESSION_COMMANDS_MAX),
});
export type ProviderSessionCommandsState = z.infer<
  typeof providerSessionCommandsStateSchema
>;
