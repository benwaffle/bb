import { z } from "zod";
import {
  listOpenBackgroundTaskItemRowsForThread,
  type DbQueryConnection,
} from "@bb/db";
import {
  isBackgroundCommandTaskType,
  threadEventBackgroundTaskItemSchema,
  type ThreadEventBackgroundTaskItem,
} from "@bb/domain";

const storedBackgroundTaskEventDataSchema = z.object({
  item: threadEventBackgroundTaskItemSchema,
});

export function findRunningBackgroundCommand(
  db: DbQueryConnection,
  args: { threadId: string; taskId: string },
): ThreadEventBackgroundTaskItem | null {
  for (const row of listOpenBackgroundTaskItemRowsForThread(db, {
    threadId: args.threadId,
  })) {
    let parsed: ReturnType<typeof storedBackgroundTaskEventDataSchema.safeParse>;
    try {
      parsed = storedBackgroundTaskEventDataSchema.safeParse(JSON.parse(row.data));
    } catch {
      continue;
    }
    if (!parsed.success) {
      continue;
    }
    const item = parsed.data.item;
    if (
      item.familyId === args.taskId &&
      isBackgroundCommandTaskType(item.taskType) &&
      item.status === "pending"
    ) {
      return item;
    }
  }
  return null;
}
