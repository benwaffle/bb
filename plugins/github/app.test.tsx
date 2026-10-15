// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { act } from "react";
import type { PluginRpcResult } from "@get-bb/plugin-sdk/app";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { githubRpcContract } from "./server.js";

const app = await loadPluginApp(() => import("./app"));

type PullDetail = PluginRpcResult<
  (typeof githubRpcContract)["getPull"]
>["pull"];

function pullDetail(overrides: Partial<PullDetail> = {}): PullDetail {
  return {
    repo: "get-bb/bb",
    number: 42,
    title: "Navigation fix",
    state: "OPEN",
    author: "octocat",
    body: "",
    url: "https://github.com/get-bb/bb/pull/42",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    baseRefName: "main",
    headRefName: "fix-navigation",
    additions: 1,
    deletions: 1,
    changedFiles: 2,
    labels: [],
    assignees: [],
    reviewDecision: "",
    mergeStateStatus: "CLEAN",
    reviewRequests: [],
    checks: [],
    comments: [],
    reviews: [],
    reviewThreads: [],
    files: [
      {
        path: "removed.ts",
        status: "removed",
        additions: 0,
        deletions: 1,
        patch: "@@ -1 +0,0 @@\n-removed",
      },
      {
        path: "modified.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
        patch: "@@ -0,0 +1 @@\n+added",
      },
    ],
    ...overrides,
  };
}

const reviewedPull = pullDetail({
  body: "Body of the pull request",
  checks: [
    { name: "lint", status: "success", url: "" },
    { name: "unit tests", status: "failure", url: "" },
    { name: "typecheck", status: "success", url: "" },
  ],
  comments: [
    {
      author: "hubot",
      body: "Activity comment",
      createdAt: "2026-08-20T00:00:00.000Z",
    },
  ],
});

function renderThreadPanel(linkedPull: PullDetail | null) {
  return renderSlot(
    app.threadPanelActions[0]!,
    { threadId: "thr-1", params: null },
    {
      rpc: {
        pullForThread: () => ({
          pull:
            linkedPull === null
              ? null
              : {
                  repo: linkedPull.repo,
                  number: linkedPull.number,
                  environmentId: "env-1",
                },
        }),
        getPull: () => ({ pull: linkedPull ?? reviewedPull }),
        listItems: () => ({
          items: [
            {
              repo: reviewedPull.repo,
              number: reviewedPull.number,
              kind: "pr",
              title: reviewedPull.title,
              state: "OPEN",
              author: "octocat",
              labels: [],
              assignees: [],
              url: reviewedPull.url,
              body: "",
              updatedAt: "2026-08-20T00:00:00.000Z",
            },
          ],
        }),
        listLinks: () => ({ links: {} }),
      },
    },
  );
}

function documentOrder(...nodes: Node[]): boolean {
  return nodes.every(
    (node, index) =>
      index === 0 ||
      (nodes[index - 1]!.compareDocumentPosition(node) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
  );
}

describe("GitHub app navigation", () => {
  it("opens issue details in the URL-backed page instead of a fixed tab", async () => {
    const panel = app.navPanels[0]!;
    expect(panel.fixedTabs).toBeUndefined();

    const slot = renderSlot(
      panel,
      { subPath: "issues" },
      {
        rpc: {
          listItems: () => ({
            items: [
              {
                repo: "get-bb/bb",
                number: 42,
                kind: "issue",
                title: "Route-backed issue",
                state: "OPEN",
                author: "octocat",
                labels: [],
                assignees: [],
                url: "https://github.com/get-bb/bb/issues/42",
                body: "",
                updatedAt: "2026-08-20T00:00:00.000Z",
              },
            ],
          }),
          listLinks: () => ({ links: {} }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [{ repo: "get-bb/bb", projectId: null }],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );

    (await slot.findByText("Route-backed issue")).click();
    expect(slot.navigateCalls).toContainEqual({
      method: "toPluginPanel",
      path: "github",
      options: { subPath: "issues/get-bb/bb/42" },
    });
    slot.lifecycle.unmount();
  });

  it("keeps removed pull-request files out of live workspace navigation", async () => {
    const slot = renderSlot(
      app.threadPanelActions[0]!,
      { threadId: "thr-1", params: null },
      {
        rpc: {
          pullForThread: () => ({
            pull: {
              repo: "get-bb/bb",
              number: 42,
              environmentId: "env-1",
            },
          }),
          getPull: () => ({ pull: pullDetail() }),
          listLinks: () => ({ links: {} }),
        },
      },
    );

    await act(async () => {});
    const removedFile = slot.getByText("removed.ts");
    const modifiedFile = slot.getByText("modified.ts");
    expect(removedFile.closest("a")).toBeNull();
    expect(modifiedFile.closest("a")?.getAttribute("href")).toBe(
      "./modified.ts",
    );

    const diffToggle = removedFile.parentElement?.querySelector("button");
    if (!(diffToggle instanceof HTMLButtonElement)) {
      throw new Error("removed file diff toggle was not rendered");
    }
    expect(diffToggle.getAttribute("aria-label")).toBe(
      "Collapse removed.ts diff",
    );
    expect(
      slot.getAllByTestId("bb-diff").map((diff) => diff.dataset.path),
    ).toEqual(["removed.ts", "modified.ts"]);
    await act(async () => diffToggle.click());
    expect(diffToggle.getAttribute("aria-label")).toBe(
      "Expand removed.ts diff",
    );
    slot.lifecycle.unmount();
  });

  it("leads the docked thread panel with the diff and only failing checks", async () => {
    const slot = renderThreadPanel(reviewedPull);
    await act(async () => {});

    const diffs = slot.getAllByTestId("bb-diff");
    const checksSummary = slot.getByText("Checks");
    const description = slot.getByRole("button", { name: /Description/ });
    const activity = slot.getByRole("button", { name: /Activity/ });
    expect(
      documentOrder(diffs[0]!, checksSummary, description, activity),
    ).toBe(true);

    expect(slot.getByText("unit tests")).toBeTruthy();
    expect(slot.queryByText("lint")).toBeNull();
    expect(slot.queryByText("Body of the pull request")).toBeNull();
    expect(slot.queryByText("Activity comment")).toBeNull();

    await act(async () => checksSummary.click());
    expect(slot.getByText("lint")).toBeTruthy();
    await act(async () => description.click());
    expect(slot.getByText("Body of the pull request")).toBeTruthy();
    await act(async () => activity.click());
    expect(slot.getByText("Activity comment")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("collapses passing checks to a summary in the docked thread panel", async () => {
    const slot = renderThreadPanel(
      pullDetail({
        checks: [
          { name: "lint", status: "success", url: "" },
          { name: "typecheck", status: "success", url: "" },
        ],
      }),
    );
    await act(async () => {});
    expect(slot.getByText("2/2 passing")).toBeTruthy();
    expect(slot.queryByText("lint")).toBeNull();
    slot.lifecycle.unmount();
  });

  it("drops the back link, repo line, and review action for the thread's own PR", async () => {
    const slot = renderThreadPanel(reviewedPull);
    await act(async () => {});
    expect(slot.getByText("Navigation fix")).toBeTruthy();
    expect(slot.queryByText(/All PRs/)).toBeNull();
    expect(slot.queryByText("get-bb/bb · #42")).toBeNull();
    expect(slot.queryByRole("button", { name: "Review with agent" })).toBeNull();
    expect(slot.getByText("Open on GitHub ↗")).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("offers a review agent for a PR picked in an unlinked thread", async () => {
    const slot = renderThreadPanel(null);
    (await slot.findByText("Navigation fix")).click();
    expect(
      await slot.findByRole("button", { name: "Review with agent" }),
    ).toBeTruthy();
    slot.lifecycle.unmount();
  });

  it("keeps the nav-panel page order with collapsed diffs and the back link", async () => {
    const slot = renderSlot(
      app.navPanels[0]!,
      { subPath: "pulls/get-bb/bb/42" },
      {
        rpc: {
          getPull: () => ({ pull: reviewedPull }),
          listLinks: () => ({ links: {} }),
          status: () => ({
            ghOk: true,
            ghState: "ready",
            ghError: null,
            repos: [{ repo: "get-bb/bb", projectId: null }],
            lastSyncedAt: null,
          }),
          viewer: () => ({ login: "octocat" }),
        },
      },
    );
    const body = await slot.findByText("Body of the pull request");
    expect(slot.getByText(/Pull requests/)).toBeTruthy();
    expect(slot.getByText("get-bb/bb · #42")).toBeTruthy();
    expect(slot.getByRole("button", { name: "Review with agent" })).toBeTruthy();
    expect(slot.getByText("lint")).toBeTruthy();
    expect(slot.queryAllByTestId("bb-diff")).toEqual([]);
    expect(
      documentOrder(
        slot.getByText("Checks"),
        body,
        slot.getByText("Activity comment"),
        slot.getByText("removed.ts"),
      ),
    ).toBe(true);
    slot.lifecycle.unmount();
  });
});
