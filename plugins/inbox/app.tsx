import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { INBOX_THREAD_LIST_ID } from "./shared/contract.js";
import { registerInboxActions } from "./app/actions.js";
import { InboxList } from "./app/ui/InboxList.js";

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: INBOX_THREAD_LIST_ID,
    title: "Inbox",
    description:
      "Threads that need you on top; working and done threads folded into shelves below.",
    component: InboxList,
  });
  registerInboxActions(app);
});
