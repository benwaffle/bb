import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin, {
  createProjectIconStore,
  ICON_FRESH_MS,
  ICON_RETRY_MS,
  pendingInteractionKinds,
  type IconFetch,
} from "./server.js";

const PLUGIN_ID = "bb--inbox";

type UiPreferences = Record<string, { revision: number; value: unknown }>;

function setup(
  options: {
    uiPreferences?: UiPreferences;
    settings?: Record<string, string>;
    interactions?: Record<string, unknown[]>;
  } = {},
) {
  const preferences: UiPreferences = { ...(options.uiPreferences ?? {}) };
  const set = vi.fn(
    async (input: { key: string; expectedRevision: number; value: unknown }) => {
      const revision = (preferences[input.key]?.revision ?? 0) + 1;
      preferences[input.key] = { revision, value: input.value };
      return { key: input.key, revision, value: input.value };
    },
  );
  const host = createFakePluginHost({
    pluginId: PLUGIN_ID,
    settings: options.settings,
    sdk: {
      system: {
        uiPreferences: {
          list: async () => ({ preferences: { ...preferences } }),
          set,
        },
      },
      threads: {
        interactions: {
          list: async ({ threadId }: { threadId: string }) => {
            const rows = options.interactions?.[threadId];
            if (rows === undefined) throw new Error(`unknown thread ${threadId}`);
            return rows;
          },
        },
      },
    },
  });
  return { ...host, preferences, set };
}

function pngResponse(bytes = [137, 80, 78, 71]): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { "content-type": "image/png" },
  });
}

describe("sidebar layout", () => {
  it("selects the inbox list on its first start, even over an explicit choice", async () => {
    const { bb, preferences } = setup({
      uiPreferences: {
        "sidebar.threadListProvider": { revision: 3, value: "thread-list/thread-list" },
      },
    });
    await plugin(bb, vi.fn());
    expect(preferences["sidebar.threadListProvider"]?.value).toBe("bb--inbox/inbox");
  });

  it("leaves a later explicit choice alone on restart", async () => {
    const { bb, harness, preferences } = setup();
    await plugin(bb, vi.fn());
    preferences["sidebar.threadListProvider"] = {
      revision: 9,
      value: "thread-list/thread-list",
    };
    await harness.lifecycle.reload((next) => plugin(next, vi.fn()));
    expect(preferences["sidebar.threadListProvider"]?.value).toBe(
      "thread-list/thread-list",
    );
  });

  it("switches to the classic list and back when the setting changes", async () => {
    const { bb, harness, preferences, set } = setup();
    await plugin(bb, vi.fn());
    await harness.behavior.setSettings({ layout: "classic" });
    await vi.waitFor(() =>
      expect(preferences["sidebar.threadListProvider"]?.value).toBe(
        "thread-list/thread-list",
      ),
    );
    await harness.behavior.setSettings({ layout: "inbox" });
    await vi.waitFor(() =>
      expect(preferences["sidebar.threadListProvider"]?.value).toBe("bb--inbox/inbox"),
    );
    expect(set.mock.calls.at(-1)?.[0].expectedRevision).toBe(
      preferences["sidebar.threadListProvider"]!.revision - 1,
    );
  });
});

describe("project icon cache", () => {
  const projects = [
    { id: "proj_gh", gitRemoteUrl: "git@github.com:acme/widgets.git" },
    { id: "proj_gh2", gitRemoteUrl: "https://github.com/acme/gadgets" },
    { id: "proj_none", gitRemoteUrl: null },
    { id: "proj_lab", gitRemoteUrl: "https://gitlab.com/acme/widgets" },
  ];

  it("returns monogram fallbacks first, then the cached avatar, fetching each source once", async () => {
    const { bb } = setup();
    const fetchIcon = vi.fn<IconFetch>(async () => pngResponse());
    const store = createProjectIconStore(bb, fetchIcon, () => 1_000);

    const first = await store.iconsFor(projects);
    expect(first.icons).toEqual({
      proj_gh: null,
      proj_gh2: null,
      proj_none: null,
      proj_lab: null,
    });
    await Promise.all(first.refreshing);
    expect(fetchIcon).toHaveBeenCalledTimes(1);
    expect(fetchIcon).toHaveBeenCalledWith("https://github.com/acme.png?size=64");

    const second = await store.iconsFor(projects);
    expect(second.refreshing).toEqual([]);
    expect(second.icons.proj_gh).toBe("data:image/png;base64,iVBORw==");
    expect(second.icons.proj_gh2).toBe(second.icons.proj_gh);
    expect(second.icons.proj_none).toBeNull();
  });

  it.each([
    ["an HTTP error", async () => new Response("nope", { status: 404, headers: { "content-type": "text/html" } })],
    ["a non-image body", async () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["a network failure", async () => { throw new Error("offline"); }],
  ])("keeps the monogram after %s and retries a day later", async (_name, failure) => {
    const { bb } = setup();
    let now = 0;
    const fetchIcon = vi.fn<IconFetch>(failure);
    const store = createProjectIconStore(bb, fetchIcon, () => now);
    await Promise.all((await store.iconsFor(projects.slice(0, 1))).refreshing);

    now = ICON_RETRY_MS - 1;
    const cached = await store.iconsFor(projects.slice(0, 1));
    expect(cached.icons.proj_gh).toBeNull();
    expect(cached.refreshing).toEqual([]);

    now = ICON_RETRY_MS;
    fetchIcon.mockImplementation(async () => pngResponse());
    await Promise.all((await store.iconsFor(projects.slice(0, 1))).refreshing);
    expect((await store.iconsFor(projects.slice(0, 1))).icons.proj_gh).toMatch(
      /^data:image\/png;base64,/,
    );
  });

  it("serves a stale icon while it refreshes", async () => {
    const { bb } = setup();
    let now = 0;
    const fetchIcon = vi.fn<IconFetch>(async () => pngResponse());
    const store = createProjectIconStore(bb, fetchIcon, () => now);
    await Promise.all((await store.iconsFor(projects.slice(0, 1))).refreshing);
    now = ICON_FRESH_MS;
    const stale = await store.iconsFor(projects.slice(0, 1));
    expect(stale.icons.proj_gh).toMatch(/^data:image\/png/);
    expect(stale.refreshing).toHaveLength(1);
  });
});

describe("pending interaction kinds", () => {
  it("reports approval over a question, input otherwise, and skips resolved or unreadable threads", async () => {
    const { bb } = setup({
      interactions: {
        both: [
          { status: "pending", payload: { kind: "user_question" } },
          { status: "pending", payload: { kind: "approval" } },
        ],
        question: [{ status: "pending", payload: { kind: "user_question" } }],
        plugin: [{ status: "pending", payload: { kind: "plugin" } }],
        resolved: [{ status: "resolved", payload: { kind: "approval" } }],
      },
    });
    await expect(
      pendingInteractionKinds(bb, ["both", "question", "plugin", "resolved", "missing"]),
    ).resolves.toEqual({ both: "approval", question: "input", plugin: "input" });
  });
});
