import {
  experimental_THREAD_ACTION_GROUPS,
  type PluginAppBuilder,
  type PluginThreadActionRegistration,
} from "@get-bb/plugin-sdk/app";
import {
  SNOOZE_PRESET_IDS,
  SNOOZE_PRESET_LABELS,
  formatWakeAt,
  isSnoozePresetId,
  snoozePresetTime,
  type InboxThreadStates,
} from "../shared/inbox-state.js";
import {
  isParked,
  openSnoozePicker,
  settleThread,
  snoozeThread,
  unsettleThread,
} from "./model/inbox-actions.js";
import { useThreadStates } from "./model/use-inbox-data.js";
import { SnoozePickerOverlay } from "./ui/SnoozePicker.js";

export const PICK_TIME_CHOICE = "pick";

const settleAction: PluginThreadActionRegistration<InboxThreadStates> = {
  id: "settle",
  title: "Settle",
  icon: "Check",
  group: experimental_THREAD_ACTION_GROUPS.state,
  order: 5,
  useData: useThreadStates,
  item({ thread, data }) {
    if (thread.archivedAt !== null) return null;
    const state = data?.[thread.id];
    if (state !== undefined) {
      return {
        label: state.snoozeUntil === null ? "Unsettle thread" : "Wake thread now",
        icon: "RotateCcw",
        run: () => unsettleThread(thread.id),
      };
    }
    if (thread.pinnedAt !== null) return null;
    return {
      label: "Settle thread",
      icon: "Check",
      run: () => settleThread(thread.id),
    };
  },
};

const snoozeAction: PluginThreadActionRegistration<InboxThreadStates> = {
  id: "snooze",
  title: "Snooze",
  icon: "Clock",
  group: experimental_THREAD_ACTION_GROUPS.state,
  order: 6,
  useData: useThreadStates,
  item({ thread, data }) {
    if (thread.archivedAt !== null) return null;
    const until = data?.[thread.id]?.snoozeUntil ?? null;
    const now = Date.now();
    return {
      label: "Snooze",
      icon: "Clock",
      ...(until === null ? {} : { detail: `Until ${formatWakeAt(until)}` }),
      choices: {
        heading: "Snooze until",
        items: [
          ...SNOOZE_PRESET_IDS.map((preset) => ({
            id: preset,
            label: `${SNOOZE_PRESET_LABELS[preset]} (${formatWakeAt(snoozePresetTime(preset, now))})`,
          })),
          { id: PICK_TIME_CHOICE, label: "Pick a time…", icon: "Calendar" },
        ],
      },
      run({ value }) {
        if (isSnoozePresetId(value)) {
          return snoozeThread(thread.id, snoozePresetTime(value, Date.now()));
        }
        if (value === PICK_TIME_CHOICE) openSnoozePicker(thread.id);
        return undefined;
      },
    };
  },
};

export function registerInboxActions(app: PluginAppBuilder): void {
  app.slots.experimental_threadAction(settleAction);
  app.slots.experimental_threadAction(snoozeAction);
  app.slots.experimental_appOverlay({
    id: "snooze-picker",
    component: SnoozePickerOverlay,
  });
  app.commands.register({
    id: "settle-thread",
    title: "Settle thread",
    defaultShortcut: { key: "s", mod: true, shift: true },
    isAvailable: ({ threadId }) => threadId !== null && !isParked(threadId),
    run: ({ threadId }) => (threadId === null ? undefined : settleThread(threadId)),
  });
  app.commands.register({
    id: "unsettle-thread",
    title: "Unsettle thread",
    defaultShortcut: { key: "u", mod: true, shift: true },
    isAvailable: ({ threadId }) => threadId !== null && isParked(threadId),
    run: ({ threadId }) => (threadId === null ? undefined : unsettleThread(threadId)),
  });
  app.commands.register({
    id: "snooze-thread",
    title: "Snooze thread…",
    defaultShortcut: { key: "h", mod: true, shift: true },
    isAvailable: ({ threadId }) => threadId !== null,
    run: ({ threadId }) => {
      if (threadId !== null) openSnoozePicker(threadId);
    },
  });
  for (const preset of SNOOZE_PRESET_IDS) {
    app.commands.register({
      id: `snooze-thread-${preset}`,
      title: `Snooze thread: ${SNOOZE_PRESET_LABELS[preset]}`,
      isAvailable: ({ threadId }) => threadId !== null,
      run: ({ threadId }) =>
        threadId === null
          ? undefined
          : snoozeThread(threadId, snoozePresetTime(preset, Date.now())),
    });
  }
}
