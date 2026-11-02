import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { THREAD_STATES_TAG } from "../shared/contract.js";
import {
  inboxThreadStateSchema,
  THREAD_STATE_KEY_PREFIX,
  threadStateKey,
  type InboxThreadState,
} from "../shared/inbox-state.js";

export const PRUNE_INTERVAL_MS = 60 * 60 * 1000;
const PRUNE_BATCH = 200;
const MAX_TIMER_MS = 2_147_483_647;

export type WakeReason =
  | "turn-started"
  | "turn-finished"
  | "failed"
  | "interaction-pending"
  | "background-command-finished"
  | "snooze-expired";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface InboxThreadStatesOptions {
  now?: () => number;
  setTimer?: (run: () => void, delayMs: number) => () => void;
}

export class PinnedThreadError extends Error {
  constructor(threadId: string) {
    super(`${threadId} is pinned, and pinned threads cannot be settled. Unpin it first.`);
    this.name = "PinnedThreadError";
  }
}

export function createInboxThreadStates(
  bb: BbPluginApi,
  options: InboxThreadStatesOptions = {},
) {
  const now = options.now ?? Date.now;
  const setTimer =
    options.setTimer ??
    ((run: () => void, delayMs: number) => {
      const timer = setTimeout(run, delayMs);
      timer.unref?.();
      return () => clearTimeout(timer);
    });

  let loaded: Promise<Map<string, InboxThreadState>> | null = null;
  const backgroundCounts = new Map<string, number>();
  let cancelSnoozeTimer: (() => void) | null = null;
  let lastPruneAt = 0;
  let pruning: Promise<void> | null = null;

  async function readAll(): Promise<Map<string, InboxThreadState>> {
    const states = new Map<string, InboxThreadState>();
    const keys = await bb.storage.kv.list(THREAD_STATE_KEY_PREFIX);
    for (const key of keys) {
      const parsed = inboxThreadStateSchema.safeParse(await bb.storage.kv.get(key));
      const threadId = key.slice(THREAD_STATE_KEY_PREFIX.length);
      if (parsed.success) {
        states.set(threadId, parsed.data);
      } else {
        await bb.storage.kv.delete(key);
      }
    }
    return states;
  }

  function states(): Promise<Map<string, InboxThreadState>> {
    loaded ??= readAll().catch((error: unknown) => {
      loaded = null;
      throw error;
    });
    return loaded;
  }

  async function write(threadId: string, state: InboxThreadState): Promise<void> {
    const map = await states();
    await bb.storage.kv.set(threadStateKey(threadId), state);
    map.set(threadId, state);
    bb.rpc.experimental_invalidate([THREAD_STATES_TAG]);
    scheduleSnoozeTimer(map);
  }

  async function remove(threadId: string): Promise<boolean> {
    const map = await states();
    backgroundCounts.delete(threadId);
    if (!map.has(threadId)) return false;
    await bb.storage.kv.delete(threadStateKey(threadId));
    map.delete(threadId);
    bb.rpc.experimental_invalidate([THREAD_STATES_TAG]);
    scheduleSnoozeTimer(map);
    return true;
  }

  async function runningBackgroundCommands(threadId: string): Promise<number> {
    try {
      const { commands } = await bb.sdk.threads.backgroundCommands({ threadId });
      return commands.length;
    } catch (error) {
      bb.log.warn(
        `could not read background commands for ${threadId}: ${errorMessage(error)}`,
      );
      return 0;
    }
  }

  async function park(
    threadId: string,
    snoozeUntil: number | null,
  ): Promise<InboxThreadState> {
    const thread = await bb.sdk.threads.get({ threadId });
    if (snoozeUntil === null && thread.pinnedAt !== null) {
      throw new PinnedThreadError(threadId);
    }
    const state: InboxThreadState = { settledAt: now(), snoozeUntil };
    backgroundCounts.set(threadId, await runningBackgroundCommands(threadId));
    await write(threadId, state);
    return state;
  }

  function settle(threadId: string): Promise<InboxThreadState> {
    return park(threadId, null);
  }

  function snooze(threadId: string, until: number): Promise<InboxThreadState> {
    if (until <= now()) {
      return Promise.reject(new Error("The snooze time must be in the future."));
    }
    return park(threadId, until);
  }

  async function unsettle(threadId: string): Promise<void> {
    await remove(threadId);
  }

  async function wake(threadId: string, reason: WakeReason): Promise<boolean> {
    if (!(await remove(threadId))) return false;
    bb.log.debug(`woke ${threadId}: ${reason}`);
    try {
      await bb.sdk.threads.markUnread({ threadId });
    } catch (error) {
      bb.log.warn(`could not mark ${threadId} unread: ${errorMessage(error)}`);
    }
    return true;
  }

  async function observeThreadEvents(threadId: string): Promise<void> {
    if (!(await states()).has(threadId)) {
      backgroundCounts.delete(threadId);
      return;
    }
    const count = await runningBackgroundCommands(threadId);
    const previous = backgroundCounts.get(threadId);
    backgroundCounts.set(threadId, count);
    if (previous !== undefined && count < previous) {
      await wake(threadId, "background-command-finished");
    }
  }

  async function expireSnoozes(): Promise<void> {
    const map = await states();
    const current = now();
    for (const [threadId, state] of [...map]) {
      if (state.snoozeUntil !== null && state.snoozeUntil <= current) {
        await wake(threadId, "snooze-expired");
      }
    }
    scheduleSnoozeTimer(map);
  }

  function scheduleSnoozeTimer(map: ReadonlyMap<string, InboxThreadState>): void {
    cancelSnoozeTimer?.();
    cancelSnoozeTimer = null;
    let next: number | null = null;
    for (const state of map.values()) {
      if (state.snoozeUntil !== null && (next === null || state.snoozeUntil < next)) {
        next = state.snoozeUntil;
      }
    }
    if (next === null) return;
    const delay = Math.min(Math.max(0, next - now()), MAX_TIMER_MS);
    cancelSnoozeTimer = setTimer(() => {
      cancelSnoozeTimer = null;
      void expireSnoozes().catch((error: unknown) => {
        bb.log.warn(`could not wake snoozed threads: ${errorMessage(error)}`);
      });
    }, delay);
  }

  async function prune(): Promise<void> {
    const map = await states();
    const ids = [...map.keys()];
    for (let index = 0; index < ids.length; index += PRUNE_BATCH) {
      const batch = ids.slice(index, index + PRUNE_BATCH);
      const { threads } = await bb.sdk.threads.experimental_listDescendants({
        threadIds: batch,
        includeArchived: true,
        includeHidden: true,
      });
      const present = new Set(threads.map((thread) => thread.threadId));
      for (const threadId of batch) {
        if (!present.has(threadId)) await remove(threadId);
      }
    }
  }

  function pruneLazily(): Promise<void> {
    if (pruning !== null) return pruning;
    if (now() - lastPruneAt < PRUNE_INTERVAL_MS) return Promise.resolve();
    lastPruneAt = now();
    pruning = prune()
      .catch((error: unknown) => {
        bb.log.warn(`could not prune deleted threads: ${errorMessage(error)}`);
      })
      .finally(() => {
        pruning = null;
      });
    return pruning;
  }

  async function list(): Promise<Record<string, InboxThreadState>> {
    const map = await states();
    void pruneLazily();
    return Object.fromEntries(map);
  }

  async function start(): Promise<void> {
    await expireSnoozes();
  }

  function dispose(): void {
    cancelSnoozeTimer?.();
    cancelSnoozeTimer = null;
  }

  return {
    list,
    settle,
    snooze,
    unsettle,
    wake,
    forget: remove,
    observeThreadEvents,
    pruneLazily,
    start,
    dispose,
  };
}

export type InboxThreadStatesStore = ReturnType<typeof createInboxThreadStates>;
