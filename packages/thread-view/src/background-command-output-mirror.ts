import { isBackgroundCommandTaskType } from "@bb/domain";
import type { EventProjectionMessage } from "./event-projection-types.js";

export function mirrorBackgroundCommandOutputsToSpawningCalls(
  messages: EventProjectionMessage[],
): EventProjectionMessage[] {
  const outputByCallId = new Map<string, string>();
  for (const message of messages) {
    if (
      message.kind !== "workflow" ||
      message.parentToolCallId === undefined ||
      message.output === null ||
      !isBackgroundCommandTaskType(message.taskType)
    ) {
      continue;
    }
    outputByCallId.set(message.parentToolCallId, message.output);
  }
  if (outputByCallId.size === 0) {
    return messages;
  }
  return messages.map((message) => {
    if (message.kind !== "command") {
      return message;
    }
    const output = outputByCallId.get(message.callId);
    return output === undefined ? message : { ...message, output };
  });
}
