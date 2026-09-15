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
      name: "Running 1 background command",
    });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(setIntervalSpy).not.toHaveBeenCalled();

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(description).textContent).toBe(description);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it("shows the command line and stops a command through its task id", () => {
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
          isExpanded={false}
          onToggle={() => {}}
          onStopCommand={onStopCommand}
        />
      </CompactViewportOverrideProvider>,
    );

    expect(screen.queryByText("Count ticks")).toBeNull();
    expect(
      screen.getByText("for i in $(seq 1 100); do echo tick $i; sleep 1; done"),
    ).not.toBeNull();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Stop background command: for i in $(seq 1 100); do echo tick $i; sleep 1; done",
      }),
    );
    expect(onStopCommand).toHaveBeenCalledWith(row);
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

    const full = screen.getByText(
      (_content, element) =>
        element?.tagName === "SPAN" && element.textContent === command,
    );
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
    const wrapped = screen
      .getAllByText(command)
      .filter((element) => element.className.includes("whitespace-pre-wrap"));
    expect(wrapped).toHaveLength(1);
    expect(wrapped[0]!.className).not.toContain("truncate");
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

    const tail = screen.getByLabelText("Background command output");
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

    expect(screen.queryByLabelText("Background command output")).toBeNull();
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
      screen.getByRole("button", { name: "Running 1 background command" }),
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
      name: "Running 1 background agent",
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
});
