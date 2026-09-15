import { z } from "zod";
import {
  listOpenBackgroundTaskItemRowsForThread,
  listOpenBackgroundTaskStateRowsForThread,
  listStoredTurnStartedRowsByTurnIdsUpToSequence,
  type DbConnection,
  type DbQueryConnection,
  type OpenBackgroundTaskItemRow,
} from "@bb/db";
import {
  convertLegacyStoredThreadEvent,
  DEFAULT_COMPLETED_TURN_DISPLAY,
  isBackgroundCommandTaskType,
  threadEventBackgroundTaskItemSchema,
  type Thread,
  type ThreadEventBackgroundTaskItem,
} from "@bb/domain";
import type { TimelineWorkflowWorkRow } from "@bb/server-contract";
import { buildThreadTimelineFromEvents } from "@bb/thread-view";
import { toThreadEventWithMeta } from "./timeline.js";

const storedEventDataRecordSchema = z.record(z.string(), z.unknown());

const storedBackgroundTaskEventDataSchema = z.object({
  item: threadEventBackgroundTaskItemSchema,
});

function parseOpenBackgroundTaskItem(
  row: OpenBackgroundTaskItemRow,
): ThreadEventBackgroundTaskItem | null {
  let json: unknown;
  try {
    json = JSON.parse(row.data);
  } catch {
    return null;
  }
  const data = storedEventDataRecordSchema.safeParse(json);
  if (!data.success) {
    return null;
  }
  const stored = convertLegacyStoredThreadEvent({
    type: "item/backgroundTask/progress",
    data: data.data,
  });
  const parsed = storedBackgroundTaskEventDataSchema.safeParse(stored.data);
  return parsed.success ? parsed.data.item : null;
}

export function findRunningBackgroundCommand(
  db: DbQueryConnection,
  args: { threadId: string; taskId: string },
): ThreadEventBackgroundTaskItem | null {
  for (const row of listOpenBackgroundTaskItemRowsForThread(db, {
    threadId: args.threadId,
  })) {
    const item = parseOpenBackgroundTaskItem(row);
    if (
      item !== null &&
      item.familyId === args.taskId &&
      isBackgroundCommandTaskType(item.taskType) &&
      item.status === "pending"
    ) {
      return item;
    }
  }
  return null;
}

export function listRunningBackgroundCommands(
  db: DbConnection,
  thread: Pick<Thread, "id" | "providerId" | "status">,
): TimelineWorkflowWorkRow[] {
  const taskRows = listOpenBackgroundTaskStateRowsForThread(db, {
    threadId: thread.id,
  });
  if (taskRows.length === 0) return [];
  const turnIds = [
    ...new Set(
      taskRows.flatMap((row) => (row.turnId === null ? [] : [row.turnId])),
    ),
  ];
  const turnStartedRows = listStoredTurnStartedRowsByTurnIdsUpToSequence(db, {
    threadId: thread.id,
    turnIds,
    sequenceCutoff: Math.max(...taskRows.map((row) => row.sequence)),
  });
  const events = [...turnStartedRows, ...taskRows]
    .sort((left, right) => left.sequence - right.sequence)
    .map(toThreadEventWithMeta);
  return buildThreadTimelineFromEvents({
    acceptedClientRequestContext: {
      acceptedClientRequestEvents: [],
      rejectedClientRequestEvents: [],
    },
    contextWindowEvents: [],
    events,
    options: {
      completedTurnDisplay: DEFAULT_COMPLETED_TURN_DISPLAY,
      includeDiagnosticOperations: false,
      includeNestedRows: false,
      isLatestPage: true,
      omitSettledDelegationChildRows: false,
      providerId: thread.providerId,
      summarizeShellCommands: false,
      threadName: "",
      threadStatus: thread.status,
      workspaceRoot: null,
    },
  }).activeBackgroundCommands;
}
