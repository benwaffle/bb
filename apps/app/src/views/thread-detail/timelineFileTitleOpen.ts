import { isAbsoluteHostPath } from "@bb/domain";
import type { ThreadTimelineLocalFileLink } from "@/components/thread/timeline/types";

export function openTimelineFileTitle({
  openDiffFile,
  openLocalFile,
  path,
}: {
  openDiffFile: (path: string) => boolean;
  openLocalFile: (link: ThreadTimelineLocalFileLink) => void;
  path: string;
}): void {
  if (!isAbsoluteHostPath(path) && openDiffFile(path)) return;
  openLocalFile({ lineRange: null, openTargetId: null, path });
}
