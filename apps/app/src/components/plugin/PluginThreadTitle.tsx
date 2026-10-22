import type { PluginThreadTitleProps } from "@get-bb/plugin-sdk";
import { ThreadTitleMentions } from "@/components/thread/ThreadTitleMentions";
import { useSidebarThreadEntry } from "@/lib/plugin-sidebar-hooks";
import { getThreadDisplayTitle } from "@/lib/thread-title";

export function PluginThreadTitle({
  threadId,
  experimental_omitPrefix: omitPrefix,
}: PluginThreadTitleProps) {
  const entry = useSidebarThreadEntry(threadId);
  if (entry === null) return null;
  const title = getThreadDisplayTitle(entry);
  return (
    <ThreadTitleMentions
      title={
        omitPrefix && title.startsWith(omitPrefix) && title !== omitPrefix
          ? title.slice(omitPrefix.length)
          : title
      }
    />
  );
}
