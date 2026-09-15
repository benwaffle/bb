// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  backgroundCommandRow,
  workflowRow,
} from "@/test/fixtures/thread-timeline-rows";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { ThreadBackgroundCommandsCard } from "./ThreadBackgroundCommandsCard";

let resizeObserverCallback: ResizeObserverCallback | null = null;
let resizeObserver: TestResizeObserver | null = null;

class TestResizeObserver implements ResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverCallback = callback;
    resizeObserver = this;
  }

  observe() {}
  unobserve() {}
  disconnect() {}
}

function reportCardWidth(target: Element, width: number): void {
  if (!resizeObserverCallback || !resizeObserver) {
    throw new Error("Expected the background card to observe its width.");
  }
  const callback = resizeObserverCallback;
  const observer = resizeObserver;
  const size: ResizeObserverSize = { inlineSize: width, blockSize: 32 };
  const entry: ResizeObserverEntry = {
    target,
    contentRect: new DOMRect(0, 0, width, 32),
    borderBoxSize: [size],
    contentBoxSize: [size],
    devicePixelContentBoxSize: [size],
  };
  act(() => callback([entry], observer));
}

function rowCommandBlock(command: string): HTMLElement {
  const matches = Array.from(
    document.querySelectorAll<HTMLElement>(".bb-code-highlight"),
  ).filter((element) => element.textContent === command);
  expect(matches).toHaveLength(1);
  return matches[0]!;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resizeObserverCallback = null;
  resizeObserver = null;
});

describe("ThreadBackgroundCommandsCard", () => {
  it("summarizes and expands a single background command in compact mode", () => {
    const description = "Poll all CI runs for batching head until completion";
    const setIntervalSpy = vi.spyOn(window, "setInterval");

    function CompactCard() {
      const [isExpanded, setIsExpanded] = useState(false);
      return (
        <CompactViewportOverrideProvider isCompactViewport>
          <ThreadBackgroundCommandsCard
            commands={[
              backgroundCommandRow({
                description,
                startedAt: 1,
                status: "pending",
                taskStatus: "running",
              }),
            ]}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((value) => !value)}
          />
        </CompactViewportOverrideProvider>
      );
    }

    render(<CompactCard />);

    const toggle = screen.getByRole("button", {
      name: "1 background command running",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(setIntervalSpy).not.toHaveBeenCalled();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(description).textContent).toBe(description);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the command line in the header and stops a command from its row", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const onStopCommand = vi.fn();
    const row = backgroundCommandRow({
      command: "for i in $(seq 1 100); do echo tick $i; sleep 1; done",
      description: "Count ticks",
      familyId: "task-1",
      startedAt: 1,
      status: "pending",
      taskStatus: "running",
    });
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[row]}
          isExpanded
          onToggle={() => {}}
          onStopCommand={onStopCommand}
        />
      </CompactViewportOverrideProvider>,
    );

    expect(screen.queryByText("Count ticks")).toBeNull();
    const header = screen.getByRole("button", {
      name: "Background commands: for i in $(seq 1 100); do echo tick $i; sleep 1; done",
    });
    const stop = screen.getByRole("button", {
      name: "Stop background command: for i in $(seq 1 100); do echo tick $i; sleep 1; done",
    });
    expect(header.parentElement!.contains(stop)).toBe(false);
    expect(
      document
        .getElementById("thread-background-commands-card-body")!
        .contains(stop),
    ).toBe(true);

    fireEvent.click(stop);
    expect(onStopCommand).toHaveBeenCalledWith(row);
  });

  it("keeps the collapsed header free of the stop control", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command: "sleep 300",
              familyId: "task-1",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded={false}
          onToggle={() => {}}
          onStopCommand={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    expect(
      screen.queryByRole("button", { name: /^Stop background command/ }),
    ).toBeNull();
  });

  it("disables the stop control while that command is being stopped and hides it for agents", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command: "sleep 300",
              familyId: "task-1",
              id: "cmd-1",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
            workflowRow({
              description: "Inspect banner",
              id: "agent-1",
              model: "haiku",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
              taskType: "local_agent",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
          onStopCommand={() => {}}
          stoppingTaskId="task-1"
        />
      </CompactViewportOverrideProvider>,
    );

    const stopButtons = screen.getAllByRole("button", {
      name: /^Stop background command/,
    });
    expect(stopButtons).toHaveLength(1);
    expect(stopButtons[0]).toHaveProperty("disabled", true);
  });

  it("shows a multi-line command in full when the card is expanded", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const command = "set -e\nfor i in 1 2 3; do\n  echo tick $i\ndone";
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command,
              familyId: "task-1",
              id: "cmd-1",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
            backgroundCommandRow({
              command: "sleep 30",
              familyId: "task-2",
              id: "cmd-2",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const full = rowCommandBlock(command);
    expect(full.className).not.toContain("truncate");
    expect(full.className).toContain("whitespace-pre-wrap");
    expect(full.className).toContain("font-mono");
  });

  it("can be expanded to read the only running command in full", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const command = "for i in $(seq 1 100); do echo tick $i; sleep 1; done";

    function Card() {
      const [isExpanded, setIsExpanded] = useState(false);
      return (
        <CompactViewportOverrideProvider isCompactViewport={false}>
          <ThreadBackgroundCommandsCard
            commands={[
              backgroundCommandRow({
                command,
                familyId: "task-1",
                startedAt: 1,
                status: "pending",
                taskStatus: "running",
              }),
            ]}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((value) => !value)}
          />
        </CompactViewportOverrideProvider>
      );
    }

    render(<Card />);
    const toggle = screen.getByRole("button", {
      name: `Background commands: ${command}`,
    });
    expect(screen.queryByText("+0 more")).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const wrapped = rowCommandBlock(command);
    expect(wrapped.className).toContain("whitespace-pre-wrap");
    expect(wrapped.className).not.toContain("truncate");
  });

  it("shows the running command's output tail when expanded", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const lines = Array.from({ length: 12 }, (_, i) => `tick ${i + 1}`);
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command: "for i in $(seq 1 12); do echo tick $i; sleep 1; done",
              familyId: "task-1",
              output: `${lines.join("\n")}\n`,
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const tail = screen.getByLabelText(/^Background command output:/);
    expect(tail.textContent).toContain("tick 12");
    expect(tail.textContent).toContain("tick 5");
    expect(tail.textContent).not.toContain("tick 4");
  });

  it("shows no output block for a command that has not printed anything", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command: "sleep 30",
              familyId: "task-1",
              output: "",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    expect(screen.queryByLabelText(/^Background command output:/)).toBeNull();
  });

  it("uses the card width when a narrow composer sits in a wide viewport", () => {
    const description = "Poll all CI runs for batching head until completion";
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              description,
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded={false}
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const card = screen.getByRole("region", { name: "Background commands" });
    expect(screen.queryByRole("button")).toBeNull();

    reportCardWidth(card, 320);

    expect(
      screen.getByRole("button", { name: "1 background command running" }),
    ).not.toBeNull();
  });

  it("summarizes and expands a single background agent in compact mode", () => {
    const description = "Inspect mobile background banner";

    function CompactCard() {
      const [isExpanded, setIsExpanded] = useState(false);
      return (
        <CompactViewportOverrideProvider isCompactViewport>
          <ThreadBackgroundCommandsCard
            commands={[
              workflowRow({
                description,
                model: "haiku",
                startedAt: 1,
                status: "pending",
                taskStatus: "running",
                taskType: "local_agent",
                workflowName: null,
              }),
            ]}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((value) => !value)}
          />
        </CompactViewportOverrideProvider>
      );
    }

    render(<CompactCard />);

    const toggle = screen.getByRole("button", {
      name: "1 background agent running",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(description).textContent).toBe(description);
    expect(screen.getByTitle("Model: haiku").textContent).toBe("haiku");
  });

  it("keeps the detailed single-agent summary on wider screens", () => {
    const description = "Inspect mobile background banner";
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            workflowRow({
              description,
              model: "haiku",
              startedAt: Date.now() - 2_000,
              status: "pending",
              taskStatus: "running",
              taskType: "local_agent",
              workflowName: null,
            }),
          ]}
          isExpanded={false}
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const item = screen.getByLabelText(
      `Background agent: ${description} · Model haiku`,
    );
    expect(item.textContent).toContain("Running background agent:");
    expect(item.textContent).toContain(description);
    expect(screen.getByTitle("Model: haiku").textContent).toBe("haiku");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("renders every running command as a uniform row when several run", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const first = "pnpm dev --filter=@bb/app";
    const second = 'for i in $(seq 1 60); do echo "tick $i"; sleep 10; done';
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command: first,
              familyId: "task-1",
              id: "cmd-1",
              output: "listening on 5173\n",
              startedAt: Date.now() - 4_000,
              status: "pending",
              taskStatus: "running",
            }),
            backgroundCommandRow({
              command: second,
              familyId: "task-2",
              id: "cmd-2",
              output: "tick 1\ntick 2\n",
              startedAt: Date.now() - 2_000,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
          onStopCommand={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const toggle = screen.getByRole("button", {
      name: "2 background commands running",
    });
    expect(toggle.textContent).not.toContain(first);
    expect(screen.queryByText("+1 more")).toBeNull();

    const rows = [first, second].map((command) => rowCommandBlock(command));
    for (const row of rows) {
      expect(row.className).toContain("font-mono");
      expect(row.className).toContain("whitespace-pre-wrap");
      expect(row.className).not.toContain("truncate");
    }
    expect(rows[0]!.className).toBe(rows[1]!.className);
    expect(rows[0]!.parentElement!.className).toBe(
      rows[1]!.parentElement!.className,
    );

    expect(
      screen.getAllByRole("button", { name: /^Stop background command/ }),
    ).toHaveLength(2);
    expect(
      screen.getByLabelText(`Background command output: ${first}`).textContent,
    ).toContain("listening on 5173");
    expect(
      screen.getByLabelText(`Background command output: ${second}`).textContent,
    ).toContain("tick 2");
  });
  it("can still be expanded to stop a command that has no recorded command line", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const onStopCommand = vi.fn();
    const row = backgroundCommandRow({
      description: "Poll all CI runs for batching head until completion",
      familyId: "task-1",
      startedAt: 1,
      status: "pending",
      taskStatus: "running",
    });

    function Card() {
      const [isExpanded, setIsExpanded] = useState(false);
      return (
        <CompactViewportOverrideProvider isCompactViewport={false}>
          <ThreadBackgroundCommandsCard
            commands={[row]}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded((value) => !value)}
            onStopCommand={onStopCommand}
          />
        </CompactViewportOverrideProvider>
      );
    }

    render(<Card />);

    fireEvent.click(
      screen.getByRole("button", {
        name: `Background commands: ${row.description}`,
      }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: `Stop background command: ${row.description}`,
      }),
    );
    expect(onStopCommand).toHaveBeenCalledWith(row);
  });
  it("clamps a long command line to three lines until its row is expanded", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const command = Array.from(
      { length: 40 },
      (_, index) => `echo "step ${index + 1}"`,
    ).join("\n");
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command,
              familyId: "task-1",
              id: "cmd-1",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
            backgroundCommandRow({
              command: "sleep 30",
              familyId: "task-2",
              id: "cmd-2",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const long = rowCommandBlock(command);
    expect(long.className).toContain("line-clamp-3");
    expect(long.className).toContain("bb-code-highlight--flowing-lines");
    expect(long.getAttribute("title")).toBe(command);
    expect(long.querySelector(".sh__token--string")?.textContent).toBe(
      '"step 1"',
    );
    const short = rowCommandBlock("sleep 30");
    expect(short.className).not.toContain("line-clamp-3");
    expect(
      screen.getAllByRole("button", { name: "Show full command" }),
    ).toHaveLength(1);

    const reveal = screen.getByRole("button", { name: "Show full command" });
    expect(reveal.getAttribute("aria-controls")).toBe(long.id);
    fireEvent.click(reveal);

    expect(long.className).not.toContain("line-clamp-3");
    expect(
      screen
        .getByRole("button", { name: "Show less" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("keeps the header outside the capped scroll region of the expanded body", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const commands = Array.from({ length: 12 }, (_, index) =>
      backgroundCommandRow({
        command: `for i in $(seq 1 60); do echo "${index} tick $i"; sleep 10; done`,
        familyId: `task-${index}`,
        id: `cmd-${index}`,
        output: Array.from({ length: 8 }, (_, line) => `tick ${line}`).join(
          "\n",
        ),
        startedAt: 1,
        status: "pending",
        taskStatus: "running",
      }),
    );
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={commands}
          isExpanded
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const toggle = screen.getByRole("button", {
      name: "12 background commands running",
    });
    const rows = screen.getByTestId("thread-background-commands-card-rows");
    expect(rows.className).toContain("max-h-80");
    expect(rows.className).toContain("overflow-y-auto");
    expect(rows.contains(toggle)).toBe(false);
    expect(rows.contains(rowCommandBlock(commands[11]!.command!))).toBe(true);
    const summary = toggle.querySelector("span.truncate");
    expect(summary?.textContent).toBe("12 background commands running");
  });

  it("keeps a single command's header summary on one truncated line", () => {
    vi.stubGlobal("ResizeObserver", TestResizeObserver);
    const command = "set -e\nfor i in 1 2 3; do\n  echo tick $i\ndone";
    render(
      <CompactViewportOverrideProvider isCompactViewport={false}>
        <ThreadBackgroundCommandsCard
          commands={[
            backgroundCommandRow({
              command,
              familyId: "task-1",
              startedAt: 1,
              status: "pending",
              taskStatus: "running",
            }),
          ]}
          isExpanded
          onToggle={() => {}}
        />
      </CompactViewportOverrideProvider>,
    );

    const toggle = document.getElementById(
      "thread-background-commands-card-toggle",
    )!;
    const headerText = Array.from(toggle.querySelectorAll("span")).find(
      (element) => element.textContent === command,
    );
    expect(headerText?.className).toContain("truncate");
    expect(headerText?.className).not.toContain("whitespace-pre-wrap");
  });
});
