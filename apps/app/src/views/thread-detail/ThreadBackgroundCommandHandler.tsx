import type { TimelineRow } from "@bb/server-contract";
import { findLatestBackgroundableCommandRow } from "@bb/thread-view";
import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import type { ThreadTimelineBackgroundCommandHandler } from "@/components/thread/timeline/types";
import { usePaneContext } from "./PaneContext";

export function ThreadBackgroundCommandHandler({
  onBackgroundCommand,
  timelineRows,
}: {
  onBackgroundCommand: ThreadTimelineBackgroundCommandHandler | undefined;
  timelineRows: readonly TimelineRow[];
}) {
  const { isFocused } = usePaneContext();

  useAppCommandHandler("thread.backgroundCommand", () => {
    if (!isFocused || onBackgroundCommand === undefined) {
      return false;
    }
    const row = findLatestBackgroundableCommandRow(timelineRows);
    if (row === null) {
      return false;
    }
    onBackgroundCommand(row.callId);
    return true;
  });

  return null;
}
