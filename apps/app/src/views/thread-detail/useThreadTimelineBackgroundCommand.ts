import { useCallback } from "react";
import type { ThreadTimelineBackgroundCommandHandler } from "@/components/thread/timeline/types";
import { useBackgroundThreadCommand } from "@/hooks/mutations/thread-runtime-mutations";

export function useThreadTimelineBackgroundCommand(
  threadId: string,
  supportsToolCallBackground: boolean,
): ThreadTimelineBackgroundCommandHandler | null {
  const { mutate } = useBackgroundThreadCommand();
  const handleBackgroundCommand = useCallback(
    (callId: string) => {
      mutate({ threadId, callId });
    },
    [mutate, threadId],
  );
  return supportsToolCallBackground ? handleBackgroundCommand : null;
}
