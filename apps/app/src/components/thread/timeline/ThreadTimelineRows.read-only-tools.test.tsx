// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TimelineRow } from "@bb/server-contract";
import {
  commandRow,
  conversationRow,
  fileReadRow,
  searchRow,
} from "@/test/fixtures/thread-timeline-rows";
import { sdk } from "@/lib/sdk";
import { ThreadProviderContext } from "../thread-provider-context";
import { ThreadTimelineRows } from "./ThreadTimelineRows";

vi.mock("@/lib/sdk", () => ({
  sdk: { threads: { timelineTurnSummaryDetails: vi.fn() } },
}));

const timelineTurnSummaryDetails = vi.mocked(
  sdk.threads.timelineTurnSummaryDetails,
);

beforeEach(() => {
  timelineTurnSummaryDetails.mockReset();
});

afterEach(() => {
  cleanup();
});

function userMessage(createdAt: number): TimelineRow {
  return conversationRow({
    id: `user-${createdAt}`,
    seq: createdAt,
    role: "user",
    text: "PROMPT",
    createdAt,
    startedAt: createdAt,
    turnId: "turn-1",
  });
}

function assistantMessage(createdAt: number): TimelineRow {
  return conversationRow({
    id: `assistant-${createdAt}`,
    seq: createdAt,
    role: "assistant",
    text: "ANSWER",
    createdAt,
    startedAt: createdAt,
    turnId: "turn-1",
  });
}

function between(row: TimelineRow): TimelineRow[] {
  return [userMessage(100), row, assistantMessage(300)];
}

function renderTimeline(timelineRows: TimelineRow[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ThreadProviderContext.Provider
          value={{
            providerId: "claude-code",
            pluginId: "provider-claude-code",
          }}
        >
          <ThreadTimelineRows
            threadId="thr_main"
            threadRuntimeDisplayStatus="idle"
            workspaceRootPath={undefined}
            timelineRows={timelineRows}
            unreadDividerPlacement={null}
          />
        </ThreadProviderContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function expand(name: RegExp): Promise<HTMLElement> {
  const header = screen.getByRole("button", { name });
  fireEvent.click(header);
  await act(async () => {
    await vi.dynamicImportSettled();
  });
  expect(header.getAttribute("aria-expanded")).toBe("true");
  return header;
}

function grepRow(overrides: Partial<Parameters<typeof searchRow>[0]> = {}) {
  return searchRow({
    id: "grep-1",
    callId: "toolu_grep",
    seq: 200,
    createdAt: 200,
    startedAt: 200,
    threadId: "thr_main",
    turnId: "turn-1",
    mode: "content",
    query: "TODO",
    path: "src",
    toolName: "Grep",
    toolArgs: { pattern: "TODO", path: "src", glob: "*.ts" },
    output: "src/a.ts:3:// TODO",
    ...overrides,
  });
}

describe("read-only tool rows", () => {
  it("expands a Claude Code Grep row to its arguments and matches", async () => {
    const { container } = renderTimeline(between(grepRow()));

    await expand(/Searched for TODO in src/);

    const body = container.textContent ?? "";
    expect(body).toContain("Grep");
    expect(body).toContain("pattern: TODO");
    expect(body).toContain("path: src");
    expect(body).toContain("glob: *.ts");
    expect(body).toContain("src/a.ts:3:// TODO");
  });

  it("expands a Glob row to its file list", async () => {
    const { container } = renderTimeline(
      between(
        searchRow({
          id: "glob-1",
          seq: 200,
          createdAt: 200,
          startedAt: 200,
          turnId: "turn-1",
          mode: "path",
          query: "**/*.ts",
          path: "src",
          toolName: "Glob",
          toolArgs: { pattern: "**/*.ts", path: "src" },
          output: "src/a.ts\nsrc/b.ts",
        }),
      ),
    );

    await expand(/files in src/);

    const body = container.textContent ?? "";
    expect(body).toContain("Glob");
    expect(body).toContain("pattern: **/*.ts");
    expect(body).toContain("src/a.ts\nsrc/b.ts");
  });

  it("shows a shell-backed search row as a highlighted command line with its output", async () => {
    const { container } = renderTimeline(
      between(
        searchRow({
          id: "rg-1",
          seq: 200,
          createdAt: 200,
          startedAt: 200,
          turnId: "turn-1",
          mode: "content",
          query: "TODO",
          path: "src",
          cmd: "rg -n TODO src",
          output: "src/a.ts:3:// TODO",
        }),
      ),
    );

    await expand(/Searched for TODO in src/);

    const highlighted = container.querySelector(".bb-code-highlight");
    expect(highlighted?.textContent).toBe("$ rg -n TODO src");
    expect(container.textContent).toContain("src/a.ts:3:// TODO");
  });

  it("describes a search row recorded without its tool input from its query and path", async () => {
    const { container } = renderTimeline(
      between(
        searchRow({
          id: "legacy-1",
          seq: 200,
          createdAt: 200,
          startedAt: 200,
          turnId: "turn-1",
          mode: "content",
          query: "TODO",
          path: "src",
        }),
      ),
    );

    await expand(/Searched for TODO in src/);

    const body = container.textContent ?? "";
    expect(body).toContain("Search");
    expect(body).toContain("pattern: TODO");
    expect(body).toContain("path: src");
  });

  it("expands a Read row to the file contents it returned", async () => {
    const { container } = renderTimeline(
      between(
        fileReadRow({
          id: "read-1",
          seq: 200,
          createdAt: 200,
          startedAt: 200,
          turnId: "turn-1",
          path: "src/index.ts",
          toolName: "Read",
          toolArgs: { file_path: "src/index.ts", limit: 20 },
          output: "1\texport const x = 1;",
        }),
      ),
    );

    await expand(/Read .*index\.ts/);

    const body = container.textContent ?? "";
    expect(body).toContain("file_path: src/index.ts");
    expect(body).toContain("limit: 20");
    expect(body).toContain("export const x = 1;");
  });

  it("expands a shell command summarized as a file listing to the command and its output", async () => {
    const { container } = renderTimeline(
      between(
        commandRow({
          id: "ls-1",
          seq: 200,
          createdAt: 200,
          startedAt: 200,
          turnId: "turn-1",
          command: "ls src",
          output: "a.ts\nb.ts",
          exitCode: 0,
          activityIntents: [
            { type: "list_files", command: "ls src", path: "src" },
          ],
        }),
      ),
    );

    await expand(/Listed files in src/);

    expect(container.querySelector(".bb-code-highlight")?.textContent).toBe(
      "$ ls src",
    );
    expect(container.textContent).toContain("a.ts\nb.ts");
  });

  it("loads a deferred search row's matches when it is expanded", async () => {
    timelineTurnSummaryDetails.mockResolvedValue({
      olderCursor: null,
      rows: [grepRow({ output: "FULL-DEFERRED-MATCHES" })],
    });
    const { container } = renderTimeline(
      between({ ...grepRow({ output: "" }), contentDeferred: true }),
    );

    await expand(/Searched for TODO in src/);
    await act(async () => {
      await Promise.resolve();
      await vi.dynamicImportSettled();
    });

    expect(timelineTurnSummaryDetails.mock.calls[0]?.[0]).toMatchObject({
      itemId: "toolu_grep",
      threadId: "thr_main",
      turnId: "turn-1",
    });
    expect(container.textContent).toContain("FULL-DEFERRED-MATCHES");
  });
});
