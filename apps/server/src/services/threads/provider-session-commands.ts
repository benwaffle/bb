import type { DbConnection } from "@bb/db";
import { getThread, listLatestThreadStateEventRowsByThreadIds } from "@bb/db";
import {
  providerSessionCommandsStateSchema,
  type ProviderSessionCommand,
} from "@bb/domain";
import type { HostDaemonEventEnvelope } from "@bb/host-daemon-contract";
import type { AppDeps } from "../../types.js";
import type { ProviderRegistration } from "../providers/provider-registry.js";
import {
  getRememberedProviderSessionCommands,
  rememberProviderSessionCommands,
} from "./provider-session-commands-store.js";
import { parseStoredEvent } from "./thread-data.js";

interface ResolveThreadSessionCommandsArgs {
  threadId: string;
  threadProviderId: string;
  requestedProviderId: string;
  registration: ProviderRegistration;
}

export function resolveThreadSessionCommands(
  db: DbConnection,
  args: ResolveThreadSessionCommandsArgs,
): ProviderSessionCommand[] {
  const kind = args.registration.sessionCommandsExtensionKind;
  if (kind === null || args.threadProviderId !== args.requestedProviderId) {
    return [];
  }
  const rows = listLatestThreadStateEventRowsByThreadIds(db, {
    threadIds: [args.threadId],
    kind,
  });
  const event = rows.length === 0 ? null : parseStoredEvent(rows[0]!);
  if (
    event === null ||
    event.type !== "thread/extensionState/updated" ||
    event.kind !== kind
  ) {
    return [];
  }
  const parsed = providerSessionCommandsStateSchema.safeParse(event.payload);
  return parsed.success ? parsed.data.commands : [];
}

interface ResolveHostSessionCommandsArgs {
  hostId: string;
  registration: ProviderRegistration;
}

export function resolveHostSessionCommands(
  deps: Pick<AppDeps, "config">,
  args: ResolveHostSessionCommandsArgs,
): ProviderSessionCommand[] {
  const kind = args.registration.sessionCommandsExtensionKind;
  if (kind === null) {
    return [];
  }
  const record = getRememberedProviderSessionCommands(deps.config.dataDir, {
    hostId: args.hostId,
    providerId: args.registration.info.id,
  });
  return record !== null && record.kind === kind ? record.state.commands : [];
}

interface RememberPublishedSessionCommandsArgs {
  hostId: string;
  envelopes: readonly HostDaemonEventEnvelope[];
  now: number;
}

export function rememberPublishedSessionCommands(
  deps: Pick<AppDeps, "config" | "db" | "providerRegistry">,
  args: RememberPublishedSessionCommandsArgs,
): void {
  for (const envelope of args.envelopes) {
    const event = envelope.event;
    if (event.type !== "thread/extensionState/updated") {
      continue;
    }
    const thread = getThread(deps.db, envelope.threadId);
    if (thread === null) {
      continue;
    }
    const registration = deps.providerRegistry.get(thread.providerId);
    if (
      registration === null ||
      registration.sessionCommandsExtensionKind !== event.kind
    ) {
      continue;
    }
    const state = providerSessionCommandsStateSchema.safeParse(event.payload);
    if (!state.success) {
      continue;
    }
    rememberProviderSessionCommands(deps.config.dataDir, {
      hostId: args.hostId,
      providerId: thread.providerId,
      kind: event.kind,
      state: state.data,
      updatedAt: args.now,
    });
  }
}
