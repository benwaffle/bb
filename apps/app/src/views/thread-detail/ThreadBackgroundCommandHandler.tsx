import { useQueryClient } from "@tanstack/react-query";
import { findLatestBackgroundableCommandRow } from "@bb/thread-view";
import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import type { ThreadTimelineBackgroundCommandHandler } from "@/components/thread/timeline/types";
import { threadTimelineQueryOptions } from "@/hooks/queries/thread-panel-queries";
import { usePaneContext } from "./PaneContext";

export function ThreadBackgroundCommandHandler({
  onBackgroundCommand,
  threadId,
}: {
  onBackgroundCommand: ThreadTimelineBackgroundCommandHandler | null;
  threadId: string;
}) {
  const { isFocused } = usePaneContext();
  const queryClient = useQueryClient();

  useAppCommandHandler("thread.backgroundCommand", () => {
    if (!isFocused || onBackgroundCommand === null) {
      return false;
    }
    const timeline = queryClient.getQueryData(
      threadTimelineQueryOptions(queryClient, threadId).queryKey,
    );
    const row = findLatestBackgroundableCommandRow(timeline?.rows ?? []);
    if (row === null) {
      return false;
    }
    onBackgroundCommand(row.callId);
    return true;
  });

  return null;
}
