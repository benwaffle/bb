import {
  listStoredProviderSessionsByProvider,
  listStoredStartupContextsByProvider,
} from "@bb/db";
import { z } from "zod";
import type { AppDeps } from "../../types.js";

export interface ProviderSessionIdentity {
  providerThreadId: string;
  threadId: string;
}

const startupForkSchema = z.object({
  fork: z
    .object({ sourceProviderThreadId: z.string().min(1) })
    .nullish()
    .catch(null),
});

function pendingForkSource(startupContext: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(startupContext);
  } catch {
    return null;
  }
  const result = startupForkSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data.fork?.sourceProviderThreadId ?? null;
}

export function listProviderSessionIdentities(
  deps: Pick<AppDeps, "db">,
  args: { providerId: string },
): ProviderSessionIdentity[] {
  const threadIdsByProviderThreadId = new Map<string, Set<string>>();
  const identities: ProviderSessionIdentity[] = [];
  const add = (identity: ProviderSessionIdentity) => {
    let threadIds = threadIdsByProviderThreadId.get(identity.providerThreadId);
    if (threadIds === undefined) {
      threadIds = new Set();
      threadIdsByProviderThreadId.set(identity.providerThreadId, threadIds);
    }
    if (threadIds.has(identity.threadId)) return;
    threadIds.add(identity.threadId);
    identities.push(identity);
  };
  for (const row of listStoredProviderSessionsByProvider(deps.db, args)) {
    add(row);
  }
  for (const row of listStoredStartupContextsByProvider(deps.db, args)) {
    const sourceProviderThreadId = pendingForkSource(row.startupContext);
    if (sourceProviderThreadId === null) continue;
    add({ providerThreadId: sourceProviderThreadId, threadId: row.threadId });
  }
  return identities;
}
