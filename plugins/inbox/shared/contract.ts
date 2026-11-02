import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const INBOX_THREAD_LIST_ID = "inbox";
export const CLASSIC_THREAD_LIST_PROVIDER = "thread-list/thread-list";
export const THREAD_LIST_PROVIDER_PREFERENCE = "sidebar.threadListProvider";
export const AUTOMATIC_THREAD_LIST_PROVIDER = "__automatic__";

export const SIDEBAR_LAYOUTS = ["inbox", "classic"] as const;
export type SidebarLayout = (typeof SIDEBAR_LAYOUTS)[number];
export const DEFAULT_SIDEBAR_LAYOUT: SidebarLayout = "inbox";

export function isSidebarLayout(value: unknown): value is SidebarLayout {
  return value === "inbox" || value === "classic";
}

export function inboxThreadListProvider(pluginId: string): string {
  return `${pluginId}/${INBOX_THREAD_LIST_ID}`;
}

export const PROJECT_ICONS_CHANGED_CHANNEL = "project-icons-changed";

export const pendingInteractionKindSchema = z.enum(["approval", "input"]);
export type PendingInteractionKind = z.infer<
  typeof pendingInteractionKindSchema
>;

export const MAX_PENDING_KIND_THREADS = 200;

export const inboxRpcContract = defineRpcContract({
  projectIcons: {
    input: z.null(),
    output: z
      .object({ icons: z.record(z.string(), z.string().nullable()) })
      .strict(),
  },
  pendingInteractionKinds: {
    input: z
      .object({
        threadIds: z.array(z.string().min(1)).max(MAX_PENDING_KIND_THREADS),
      })
      .strict(),
    output: z
      .object({ kinds: z.record(z.string(), pendingInteractionKindSchema) })
      .strict(),
  },
});
