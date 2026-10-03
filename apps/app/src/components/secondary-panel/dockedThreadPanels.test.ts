// @vitest-environment jsdom

import { createStore } from "jotai";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dockThreadPanels,
  getDockedThreadPanelsAtom,
  resolveDockedThreadPanelRequests,
  type DockedThreadPanel,
} from "./dockedThreadPanels";

const PR_PANEL: DockedThreadPanel = {
  pluginId: "github",
  actionId: "pull",
  title: "GitHub PR",
  paramsJson: null,
};

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("dockThreadPanels", () => {
  it("appends new panels and updates an identical one in place", () => {
    const queue = { ...PR_PANEL, pluginId: "pr-review", actionId: "queue" };
    const docked = dockThreadPanels([PR_PANEL], [queue]);
    expect(docked).toEqual([PR_PANEL, queue]);

    const renamed = { ...PR_PANEL, title: "PR #12" };
    expect(dockThreadPanels(docked, [renamed])).toEqual([renamed, queue]);
  });

  it("treats different params as different panels", () => {
    const other = { ...PR_PANEL, paramsJson: '{"number":2}' };
    expect(dockThreadPanels([PR_PANEL], [other])).toEqual([PR_PANEL, other]);
  });
});

describe("resolveDockedThreadPanelRequests", () => {
  const actions = [
    { pluginId: "github", id: "pull", title: "GitHub PR" },
    { pluginId: "pr-review", id: "queue", title: "Review queue" },
  ];

  it("defaults to the caller's plugin and allows another plugin's action", () => {
    expect(
      resolveDockedThreadPanelRequests({
        requests: [
          { actionId: "queue" },
          { pluginId: "github", actionId: "pull", params: { n: 1 } },
        ],
        callerPluginId: "pr-review",
        actions,
      }),
    ).toEqual([
      {
        pluginId: "pr-review",
        actionId: "queue",
        title: "Review queue",
        paramsJson: null,
      },
      {
        pluginId: "github",
        actionId: "pull",
        title: "GitHub PR",
        paramsJson: '{"n":1}',
      },
    ]);
  });

  it("docks a not-yet-loaded action under its id and skips non-JSON params", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      resolveDockedThreadPanelRequests({
        requests: [
          { pluginId: "later", actionId: "tab" },
          { actionId: "queue", params: { bad: () => 1 } as never },
        ],
        callerPluginId: "pr-review",
        actions,
      }),
    ).toEqual([
      { pluginId: "later", actionId: "tab", title: "tab", paramsJson: null },
    ]);
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});

describe("docked panel persistence", () => {
  it("writes docked panels per thread and ignores malformed storage", () => {
    createStore().set(getDockedThreadPanelsAtom("thr_write"), [PR_PANEL]);
    expect(
      JSON.parse(
        window.localStorage.getItem("bb.thread.dockedPanels-thr_write") ?? "",
      ),
    ).toEqual([PR_PANEL]);

    window.localStorage.setItem(
      "bb.thread.dockedPanels-thr_restore",
      JSON.stringify([PR_PANEL]),
    );
    window.localStorage.setItem(
      "bb.thread.dockedPanels-thr_malformed",
      '[{"pluginId":1}]',
    );
    const store = createStore();
    expect(store.get(getDockedThreadPanelsAtom("thr_restore"))).toEqual([
      PR_PANEL,
    ]);
    expect(store.get(getDockedThreadPanelsAtom("thr_malformed"))).toEqual([]);
  });
});
