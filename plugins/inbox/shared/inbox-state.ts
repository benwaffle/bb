import { z } from "zod";

export const inboxThreadStateSchema = z
  .object({
    settledAt: z.number().int().nonnegative(),
    snoozeUntil: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type InboxThreadState = z.infer<typeof inboxThreadStateSchema>;

export type InboxThreadStates = Readonly<Record<string, InboxThreadState>>;

export const THREAD_STATE_KEY_PREFIX = "thread:";

export function threadStateKey(threadId: string): string {
  return `${THREAD_STATE_KEY_PREFIX}${threadId}`;
}

export function snoozeExpired(state: InboxThreadState, now: number): boolean {
  return state.snoozeUntil !== null && state.snoozeUntil <= now;
}

export function nextSnoozeWake(states: InboxThreadStates, now: number): number | null {
  let next: number | null = null;
  for (const state of Object.values(states)) {
    const until = state.snoozeUntil;
    if (until === null || until <= now) continue;
    if (next === null || until < next) next = until;
  }
  return next;
}

export const SNOOZE_PRESET_IDS = ["1h", "tomorrow", "monday"] as const;
export type SnoozePresetId = (typeof SNOOZE_PRESET_IDS)[number];

export const SNOOZE_PRESET_LABELS: Record<SnoozePresetId, string> = {
  "1h": "1 hour",
  tomorrow: "Tomorrow 9am",
  monday: "Next Monday 9am",
};

export function isSnoozePresetId(value: unknown): value is SnoozePresetId {
  return value === "1h" || value === "tomorrow" || value === "monday";
}

const HOUR_MS = 60 * 60 * 1000;
const WAKE_HOUR = 9;
const MONDAY = 1;

export function snoozePresetTime(preset: SnoozePresetId, now: number): number {
  if (preset === "1h") return now + HOUR_MS;
  const date = new Date(now);
  const days =
    preset === "tomorrow" ? 1 : ((MONDAY - date.getDay() + 7) % 7 || 7);
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    WAKE_HOUR,
  ).getTime();
}

export function formatWakeIn(until: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatWakeAt(until: number): string {
  return new Date(until).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
