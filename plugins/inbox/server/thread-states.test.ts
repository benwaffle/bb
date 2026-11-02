import { createFakePluginHost, makeThreadResponse } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "../server.js";
import { PRUNE_INTERVAL_MS } from "./thread-states.js";

const HOUR = 60 * 60 * 1000;

function setup(options: { threads?: string[] } = {}) {
  const known = new Set(options.threads ?? ["thr_a", "thr_b"]);
  const background = new Map<string, number>();
  const markUnread = vi.fn(async ({ threadId }: { threadId: string }) =>
    makeThreadResponse({ id: threadId }),
  );
  let now = 1_000_000;
  const timers: { run: () => void; at: number }[] = [];
  const host = createFakePluginHost({
    pluginId: "bb--inbox",
    sdk: {
      system: {
        uiPreferences: {
          list: async () => ({ preferences: {} }),
          set: async (input: { key: string; value: unknown }) => ({
            key: input.key,
            revision: 1,
            value: input.value,
          }),
        },
      },
      threads: {
        get: async ({ threadId }: { threadId: string }) => {
          if (!known.has(threadId)) throw new Error(`thread not found: ${threadId}`);
          return makeThreadResponse({ id: threadId });
        },
        backgroundCommands: async ({ threadId }: { threadId: string }) => ({
          commands: Array.from({ length: background.get(threadId) ?? 0 }, () => ({})),
        }),
        markUnread,
        experimental_listDescendants: async ({ threadIds }: { threadIds: readonly string[] }) => ({
          threads: threadIds
            .filter((threadId) => known.has(threadId))
            .map((threadId) => ({ threadId, descendantIds: [] })),
        }),
      },
    },
  });
  const start = () =>
    plugin(host.bb, vi.fn(), {
      now: () => now,
      setTimer: (run, delayMs) => {
        const timer = { run, at: now + delayMs };
        timers.push(timer);
        return () => {
          timers.splice(timers.indexOf(timer), 1);
        };
      },
    });
  const advance = async (ms: number) => {
    now += ms;
    for (const timer of [...timers]) {
      if (timer.at <= now) {
        timers.splice(timers.indexOf(timer), 1);
        timer.run();
      }
    }
    await vi.waitFor(async () => undefined);
  };
  const states = async () =>
    ((await host.harness.behavior.callRpc("threadStates", null)) as {
      states: Record<string, { settledAt: number; snoozeUntil: number | null }>;
    }).states;
  const emit = host.harness.behavior.emitThreadEvent.bind(host.harness.behavior);
  return {
    ...host,
    known,
    background,
    markUnread,
    start,
    advance,
    states,
    emit,
    now: () => now,
    pendingTimers: () => timers.length,
  };
}

describe("settle and snooze", () => {
  it("persists settle, snooze and unsettle per thread, across a reload", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_a" });
    await ctx.harness.behavior.callRpc("snooze", {
      threadId: "thr_b",
      until: ctx.now() + HOUR,
    });
    expect(await ctx.states()).toEqual({
      thr_a: { settledAt: ctx.now(), snoozeUntil: null },
      thr_b: { settledAt: ctx.now(), snoozeUntil: ctx.now() + HOUR },
    });
    const reloaded = await ctx.harness.lifecycle.reload((next) =>
      plugin(next, vi.fn(), { now: ctx.now, setTimer: () => () => undefined }),
    );
    const call = reloaded.harness.behavior.callRpc.bind(reloaded.harness.behavior);
    const keys = async () =>
      Object.keys(
        ((await call("threadStates", null)) as { states: Record<string, unknown> }).states,
      ).sort();
    expect(await keys()).toEqual(["thr_a", "thr_b"]);
    await call("unsettle", { threadId: "thr_a" });
    expect(await keys()).toEqual(["thr_b"]);
    expect(ctx.markUnread).not.toHaveBeenCalled();
  });

  it("rejects unknown threads and snooze times in the past", async () => {
    const ctx = setup();
    await ctx.start();
    await expect(
      ctx.harness.behavior.callRpc("settle", { threadId: "thr_missing" }),
    ).rejects.toThrow(/thread not found/);
    await expect(
      ctx.harness.behavior.callRpc("snooze", { threadId: "thr_a", until: ctx.now() }),
    ).rejects.toThrow(/future/);
    expect(await ctx.states()).toEqual({});
  });
});

describe("wake events", () => {
  it.each([
    ["thread.active", "a new turn starts (user or child/agent message)"],
    ["thread.idle", "a turn finishes"],
    ["thread.failed", "the thread fails"],
    ["interaction.pending", "an approval or question is requested"],
  ] as const)("%s wakes a settled thread: %s", async (event, _description) => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_a" });
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_b" });
    const thread = makeThreadResponse({ id: "thr_a" });
    const payload =
      event === "thread.idle"
        ? { thread, lastAssistantText: null }
        : event === "thread.failed"
          ? { thread, error: null }
          : event === "interaction.pending"
            ? { thread, interaction: {} as never }
            : { thread };
    const { errors } = await ctx.emit(event, payload as never);
    expect(errors).toEqual([]);
    expect(Object.keys(await ctx.states())).toEqual(["thr_b"]);
    expect(ctx.markUnread).toHaveBeenCalledWith({ threadId: "thr_a" });
  });

  it("wakes a snoozed thread early", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("snooze", {
      threadId: "thr_a",
      until: ctx.now() + HOUR,
    });
    await ctx.emit("thread.idle", {
      thread: makeThreadResponse({ id: "thr_a" }),
      lastAssistantText: null,
    });
    expect(await ctx.states()).toEqual({});
    expect(ctx.markUnread).toHaveBeenCalledTimes(1);
  });

  it("ignores events for threads that are not parked", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.emit("thread.idle", {
      thread: makeThreadResponse({ id: "thr_a" }),
      lastAssistantText: null,
    });
    expect(ctx.markUnread).not.toHaveBeenCalled();
  });

  it("wakes when a background command running at settle time finishes", async () => {
    const ctx = setup();
    await ctx.start();
    ctx.background.set("thr_a", 2);
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_a" });
    const events = () =>
      ctx.emit("experimental_thread.events", {
        thread: makeThreadResponse({ id: "thr_a" }),
        sequence: 1,
      });
    await events();
    expect(Object.keys(await ctx.states())).toEqual(["thr_a"]);
    ctx.background.set("thr_a", 1);
    await events();
    expect(await ctx.states()).toEqual({});
    expect(ctx.markUnread).toHaveBeenCalledWith({ threadId: "thr_a" });
  });

  it("wakes when a background command started after settling finishes", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_a" });
    const events = () =>
      ctx.emit("experimental_thread.events", {
        thread: makeThreadResponse({ id: "thr_a" }),
        sequence: 1,
      });
    ctx.background.set("thr_a", 1);
    await events();
    expect(Object.keys(await ctx.states())).toEqual(["thr_a"]);
    ctx.background.set("thr_a", 0);
    await events();
    expect(await ctx.states()).toEqual({});
  });

  it("wakes a snoozed thread at its time and marks it unread", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("snooze", {
      threadId: "thr_a",
      until: ctx.now() + HOUR,
    });
    await ctx.harness.behavior.callRpc("snooze", {
      threadId: "thr_b",
      until: ctx.now() + 2 * HOUR,
    });
    await ctx.advance(HOUR - 1);
    expect(Object.keys(await ctx.states()).sort()).toEqual(["thr_a", "thr_b"]);
    await ctx.advance(1);
    await vi.waitFor(async () =>
      expect(Object.keys(await ctx.states())).toEqual(["thr_b"]),
    );
    expect(ctx.markUnread).toHaveBeenCalledWith({ threadId: "thr_a" });
    expect(ctx.pendingTimers()).toBe(1);
  });
});

describe("deleted threads", () => {
  it("drops the entry when a thread is deleted", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_a" });
    await ctx.emit("thread.deleted", { thread: makeThreadResponse({ id: "thr_a" }) });
    expect(await ctx.states()).toEqual({});
    expect(ctx.markUnread).not.toHaveBeenCalled();
  });

  it("prunes entries for threads deleted while the plugin was not listening", async () => {
    const ctx = setup();
    await ctx.start();
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_a" });
    await ctx.harness.behavior.callRpc("settle", { threadId: "thr_b" });
    await ctx.states();
    ctx.known.delete("thr_a");
    await ctx.advance(PRUNE_INTERVAL_MS);
    await ctx.states();
    await vi.waitFor(async () =>
      expect(Object.keys(await ctx.states())).toEqual(["thr_b"]),
    );
  });
});

describe("bb inbox CLI", () => {
  it("settles the current thread, snoozes by preset, lists and unsettles", async () => {
    const ctx = setup();
    await ctx.start();
    const run = (argv: string[]) =>
      ctx.harness.behavior.runCli(argv, { threadId: "thr_a" });
    expect((await run(["settle"])).exitCode).toBe(0);
    expect((await run(["snooze", "thr_b", "1h"])).exitCode).toBe(0);
    const listed = await run(["list"]);
    expect(listed.stdout).toContain("thr_a\tsettled");
    expect(listed.stdout).toContain("thr_b\tsnoozed");
    expect((await run(["unsettle", "thr_b"])).exitCode).toBe(0);
    expect(Object.keys(await ctx.states())).toEqual(["thr_a"]);
  });

  it("rejects a bad snooze time", async () => {
    const ctx = setup();
    await ctx.start();
    const result = await ctx.harness.behavior.runCli(["snooze", "thr_a", "someday"], {});
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("1h, tomorrow, monday");
  });
});
