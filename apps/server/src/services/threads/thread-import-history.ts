import {
  appendDaemonEventsInTransaction,
  deriveStoredEventItemFields,
  type AppendDaemonEventInput,
} from "@bb/db";
import {
  getThreadEventScopeTurnId,
  threadScope,
  type ResolvedThreadExecutionOptions,
  type ThreadEvent,
  type ThreadEventType,
} from "@bb/domain";
import type { ImportedThreadTurn } from "@bb/server-contract";
import type { AppDeps } from "../../types.js";
import { ApiError } from "../../errors.js";
import {
  buildImportedTurnRequestEventData,
  createClientTurnRequestId,
} from "./thread-events.js";

export const IMPORTED_EVENT_TYPES = [
  "turn/started",
  "turn/input/accepted",
  "item/completed",
  "item/backgroundTask/completed",
  "turn/completed",
  "thread/compacted",
] as const satisfies readonly ThreadEventType[];

const importedEventTypeSet: ReadonlySet<ThreadEventType> = new Set(
  IMPORTED_EVENT_TYPES,
);

export interface ImportedThreadHistory {
  sourceProviderThreadId: string;
  turns: readonly ImportedThreadTurn[];
}

export function resolveImportedForkCheckpoint(
  turns: readonly ImportedThreadTurn[],
): string | undefined {
  for (const turn of [...turns].reverse()) {
    for (const entry of [...turn.events].reverse()) {
      if (
        entry.event.type === "turn/completed" &&
        entry.event.providerCheckpointId !== undefined
      ) {
        return entry.event.providerCheckpointId;
      }
    }
  }
  return undefined;
}

interface AppendImportedThreadHistoryArgs {
  environmentId: string | null;
  execution: ResolvedThreadExecutionOptions;
  threadId: string;
  turns: readonly ImportedThreadTurn[];
}

function toImportedEventRow(args: {
  createdAt: number;
  environmentId: string | null;
  event: ThreadEvent;
}): AppendDaemonEventInput {
  const { scope, type, threadId, ...data } = args.event;
  return {
    createdAt: args.createdAt,
    data: JSON.stringify(data),
    environmentId: args.environmentId,
    ...deriveStoredEventItemFields(args.event),
    providerThreadId: null,
    scope,
    threadId,
    type,
  };
}

function buildImportedEventRows(
  args: AppendImportedThreadHistoryArgs,
): AppendDaemonEventInput[] {
  const rows: AppendDaemonEventInput[] = [];
  const startedTurnIds = new Set<string>();
  for (const [turnIndex, turn] of args.turns.entries()) {
    const requestId = createClientTurnRequestId();
    rows.push({
      createdAt: turn.at,
      data: JSON.stringify(
        buildImportedTurnRequestEventData({
          execution: args.execution,
          input: turn.input,
          requestId,
        }),
      ),
      environmentId: args.environmentId,
      itemId: null,
      itemKind: null,
      parentToolCallId: null,
      providerThreadId: null,
      scope: threadScope(),
      threadId: args.threadId,
      type: "client/turn/requested",
    });
    for (const entry of turn.events) {
      if (!importedEventTypeSet.has(entry.event.type)) {
        continue;
      }
      const event: ThreadEvent =
        entry.event.type === "turn/input/accepted"
          ? { ...entry.event, threadId: args.threadId, clientRequestId: requestId }
          : { ...entry.event, threadId: args.threadId };
      const turnId = getThreadEventScopeTurnId(event.scope);
      if (turnId !== undefined) {
        if (event.type === "turn/started") {
          startedTurnIds.add(turnId);
        } else if (!startedTurnIds.has(turnId)) {
          throw new ApiError(
            400,
            "invalid_request",
            `Imported turn ${turnIndex + 1} has a ${event.type} event for turn ${turnId} before its turn/started`,
          );
        }
      }
      rows.push(
        toImportedEventRow({
          createdAt: entry.at,
          environmentId: args.environmentId,
          event,
        }),
      );
    }
  }
  return rows;
}

export function appendImportedThreadHistory(
  deps: Pick<AppDeps, "db" | "hub">,
  args: AppendImportedThreadHistoryArgs,
): void {
  const rows = buildImportedEventRows(args);
  deps.db.transaction(
    (tx) => appendDaemonEventsInTransaction(tx, rows),
    { behavior: "immediate" },
  );
  deps.hub.notifyThread(args.threadId, ["events-appended"], {
    eventTypes: [...new Set(rows.map((row) => row.type))],
  });
}
