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
  systemRow,
} from "@/test/fixtures/thread-timeline-rows";
import { ThreadProviderContext } from "../thread-provider-context";
import { ThreadTimelineRows } from "./ThreadTimelineRows";

const PREVIEW_SELECTOR = "[data-timeline-hover-preview]";

beforeEach(() => {
  vi.useFakeTimers();
});

const initialViewportWidth = window.innerWidth;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setViewportWidth(initialViewportWidth);
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

function command(
  createdAt: number,
  commandText = `echo ${createdAt}`,
): TimelineRow {
  return commandRow({
    id: `command-${createdAt}`,
    seq: createdAt,
    command: commandText,
    output: `output-${createdAt}`,
    exitCode: 0,
    createdAt,
    startedAt: createdAt,
    turnId: "turn-1",
  });
}

function renderTimeline(timelineRows: TimelineRow[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <ThreadProviderContext.Provider
          value={{ providerId: "echo-agent", pluginId: "echo-provider" }}
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

function preview(): Element | null {
  return document.querySelector(PREVIEW_SELECTOR);
}

function previews(): Element[] {
  return [...document.querySelectorAll(PREVIEW_SELECTOR)];
}

async function settleLazyRenderers() {
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function singleCommandTimeline(): TimelineRow[] {
  return [userMessage(100), command(200), assistantMessage(300)];
}

function separatedCommandsTimeline(): TimelineRow[] {
  return [
    userMessage(100),
    command(200),
    assistantMessage(300),
    command(400),
    assistantMessage(500),
  ];
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
}

describe("timeline row hover preview", () => {
  it("shows a collapsed command's output after the hover delay without expanding it", async () => {
    renderTimeline(singleCommandTimeline());
    const header = screen.getByRole("button", { name: /Ran echo 200/ });

    fireEvent.pointerEnter(header);
    advance(300);
    expect(preview()).toBeNull();
    advance(100);
    expect(preview()).not.toBeNull();
    await act(async () => {
      await vi.dynamicImportSettled();
    });

    expect(preview()?.textContent).toContain("$ echo 200");
    expect(preview()?.textContent).toContain("output-200");
    expect(header.getAttribute("aria-expanded")).toBe("false");

    fireEvent.pointerLeave(header);
    advance(200);
    expect(preview()).toBeNull();
  });

  it("does not open on keyboard focus alone", () => {
    renderTimeline(singleCommandTimeline());
    const header = screen.getByRole("button", { name: /Ran echo 200/ });

    act(() => {
      header.focus();
    });
    advance(1_000);

    expect(preview()).toBeNull();
  });

  it("closes on Escape", () => {
    renderTimeline(singleCommandTimeline());
    const header = screen.getByRole("button", { name: /Ran echo 200/ });
    fireEvent.pointerEnter(header);
    advance(400);
    expect(preview()).not.toBeNull();

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });

    expect(preview()).toBeNull();
  });

  it("still expands on click and hides the preview while expanded", () => {
    renderTimeline(singleCommandTimeline());
    const header = screen.getByRole("button", { name: /Ran echo 200/ });
    fireEvent.pointerEnter(header);
    advance(400);
    expect(preview()).not.toBeNull();

    fireEvent.click(header);
    advance(400);

    expect(header.getAttribute("aria-expanded")).toBe("true");
    expect(preview()).toBeNull();
  });

  it("shows the thought text for a collapsed reasoning row", () => {
    renderTimeline([
      systemRow({
        id: "thread:op:reasoning:turn-1:item-1",
        systemKind: "operation",
        operationKind: "reasoning",
        title: "Thought for 12s",
        detail: "Compare both render paths.",
        status: "completed",
        startedAt: 1_000,
        completedAt: 13_000,
      }),
    ]);
    const header = screen.getByRole("button", { name: /Thought.*12s/ });

    fireEvent.pointerEnter(header);
    advance(400);

    expect(preview()?.textContent).toContain("Compare both render paths.");
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("lists each grouped command by its first line", () => {
    renderTimeline([
      userMessage(100),
      command(200, "pnpm install\n--frozen-lockfile"),
      command(300),
      command(400),
      assistantMessage(500),
    ]);
    const header = screen.getByRole("button", { name: /Ran 3 commands/ });

    fireEvent.pointerEnter(header);
    advance(400);

    const items = [...(preview()?.querySelectorAll("li") ?? [])];
    expect(items.map((item) => item.textContent)).toEqual([
      "$ pnpm install …",
      "$ echo 300",
      "$ echo 400",
    ]);
    expect(
      items.every((item) => item.querySelector(".bb-code-highlight") !== null),
    ).toBe(true);
    expect(header.getAttribute("aria-expanded")).toBe("false");
  });

  it("switches to the next row's preview immediately while one is open", async () => {
    renderTimeline(separatedCommandsTimeline());
    const first = screen.getByRole("button", { name: /Ran echo 200/ });
    const second = screen.getByRole("button", { name: /Ran echo 400/ });

    fireEvent.pointerEnter(first);
    advance(400);
    await settleLazyRenderers();
    expect(previews()).toHaveLength(1);
    expect(preview()?.textContent).toContain("output-200");

    fireEvent.pointerLeave(first);
    fireEvent.pointerEnter(second);
    await settleLazyRenderers();

    expect(previews()).toHaveLength(1);
    expect(preview()?.textContent).toContain("output-400");
  });

  it("opens instantly shortly after a preview closes and waits again once cold", () => {
    renderTimeline(separatedCommandsTimeline());
    const first = screen.getByRole("button", { name: /Ran echo 200/ });
    const second = screen.getByRole("button", { name: /Ran echo 400/ });

    fireEvent.pointerEnter(first);
    advance(400);
    fireEvent.pointerLeave(first);
    advance(200);
    expect(preview()).toBeNull();

    advance(200);
    fireEvent.pointerEnter(second);
    advance(0);
    expect(preview()).not.toBeNull();

    fireEvent.pointerLeave(second);
    advance(200);
    expect(preview()).toBeNull();
    advance(400);

    fireEvent.pointerEnter(first);
    advance(300);
    expect(preview()).toBeNull();
    advance(100);
    expect(preview()).not.toBeNull();
  });

  it("places the preview beside the pointer, flipping left near the right edge", () => {
    setViewportWidth(1_200);
    renderTimeline(singleCommandTimeline());
    const header = screen.getByRole("button", { name: /Ran echo 200/ });

    fireEvent.pointerEnter(header, { clientX: 120 });
    advance(400);
    expect(preview()?.getAttribute("data-side")).toBe("right");

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    advance(1_000);
    fireEvent.pointerEnter(header, { clientX: 1_100 });
    advance(400);
    expect(preview()?.getAttribute("data-side")).toBe("left");
  });
});
