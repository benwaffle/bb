import { z } from "zod";
import {
  listOpenBackgroundTaskItemRowsForThread,
  type DbQueryConnection,
  type OpenBackgroundTaskItemRow,
} from "@bb/db";
import {
  convertLegacyStoredThreadEvent,
  isBackgroundCommandTaskType,
  threadEventBackgroundTaskItemSchema,
  type ThreadEventBackgroundTaskItem,
} from "@bb/domain";

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
