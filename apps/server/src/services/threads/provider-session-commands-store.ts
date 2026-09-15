import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { providerSessionCommandsStateSchema } from "@bb/domain";
import { z } from "zod";

const PROVIDER_SESSION_COMMANDS_FILE_NAME = "provider-session-commands.json";
const PROVIDER_SESSION_COMMANDS_FILE_VERSION = 1;

const rememberedProviderSessionCommandsSchema = z.object({
  hostId: z.string().min(1),
  providerId: z.string().min(1),
  kind: z.string().min(1),
  state: providerSessionCommandsStateSchema,
  updatedAt: z.number().int().nonnegative(),
});
export type RememberedProviderSessionCommands = z.infer<
  typeof rememberedProviderSessionCommandsSchema
>;

const providerSessionCommandsFileSchema = z.object({
  version: z.literal(PROVIDER_SESSION_COMMANDS_FILE_VERSION),
  entries: z.array(rememberedProviderSessionCommandsSchema),
});
type ProviderSessionCommandsFile = z.infer<
  typeof providerSessionCommandsFileSchema
>;

export interface ProviderSessionCommandsKey {
  hostId: string;
  providerId: string;
}

export function providerSessionCommandsFilePath(dataDir: string): string {
  return join(dataDir, PROVIDER_SESSION_COMMANDS_FILE_NAME);
}

function readStore(dataDir: string): ProviderSessionCommandsFile {
  const empty: ProviderSessionCommandsFile = {
    version: PROVIDER_SESSION_COMMANDS_FILE_VERSION,
    entries: [],
  };
  let raw: string;
  try {
    raw = readFileSync(providerSessionCommandsFilePath(dataDir), "utf8");
  } catch {
    return empty;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return empty;
  }
  const parsed = providerSessionCommandsFileSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : empty;
}

function writeStore(dataDir: string, store: ProviderSessionCommandsFile): void {
  mkdirSync(dataDir, { recursive: true });
  const finalPath = providerSessionCommandsFilePath(dataDir);
  const temporaryPath = `${finalPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, finalPath);
}

function matchesKey(
  entry: RememberedProviderSessionCommands,
  key: ProviderSessionCommandsKey,
): boolean {
  return entry.hostId === key.hostId && entry.providerId === key.providerId;
}

export function getRememberedProviderSessionCommands(
  dataDir: string,
  key: ProviderSessionCommandsKey,
): RememberedProviderSessionCommands | null {
  return (
    readStore(dataDir).entries.find((entry) => matchesKey(entry, key)) ?? null
  );
}

export function rememberProviderSessionCommands(
  dataDir: string,
  record: RememberedProviderSessionCommands,
): void {
  const store = readStore(dataDir);
  store.entries = [
    ...store.entries.filter((entry) => !matchesKey(entry, record)),
    record,
  ];
  writeStore(dataDir, store);
}
