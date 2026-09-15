// @vitest-environment jsdom

import type { ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_ORDERED_MENTION_SUGGESTIONS } from "@bb/client-core";
import {
  INERT_TYPEAHEAD_COMMAND_CONFIG,
  PromptBoxInternal,
  type PromptPushToTalkConfig,
  type PromptVoiceConfig,
} from "./PromptBoxInternal";
import { VOICE_INTERIM_CLASS } from "./editor/voice-interim-extension";

type PromptBoxProps = ComponentProps<typeof PromptBoxInternal>;

function createProps(overrides: Partial<PromptBoxProps> = {}): PromptBoxProps {
  return {
    value: "",
    mentionRanges: [],
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    mentionMenuPlacement: "bottom",
    typeahead: {
      mention: {
        results: EMPTY_ORDERED_MENTION_SUGGESTIONS,
        isLoading: false,
        isError: false,
        onQueryChange: vi.fn(),
      },
      command: INERT_TYPEAHEAD_COMMAND_CONFIG,
    },
    ...overrides,
  };
}

function createPushToTalk(
  overrides: Partial<PromptPushToTalkConfig> = {},
): PromptPushToTalkConfig {
  return {
    enabled: true,
    state: "idle",
    stream: null,
    transcript: { committedText: "", interimText: "" },
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
}

function createVoice(pushToTalk: PromptPushToTalkConfig): PromptVoiceConfig {
  return {
    state: "idle",
    isSupported: true,
    stream: null,
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    pushToTalk,
  };
}

function editorElement(): HTMLElement {
  const element = document.querySelector(".ProseMirror");
  if (!(element instanceof HTMLElement)) {
    throw new Error("Prompt editor element was not rendered");
  }
  return element;
}

function pressSpace(target: Element): void {
  fireEvent.keyDown(target, { key: " ", code: "Space" });
}

function releaseSpace(target: Element): void {
  fireEvent.keyUp(target, { key: " ", code: "Space" });
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PromptBoxInternal push-to-talk", () => {
  it("starts after holding Space in an empty composer and stops on release", async () => {
    const pushToTalk = createPushToTalk();
    render(
      <PromptBoxInternal
        {...createProps({ voice: createVoice(pushToTalk) })}
      />,
    );
    await waitFor(() => editorElement());

    pressSpace(editorElement());
    expect(pushToTalk.start).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(pushToTalk.start).toHaveBeenCalledOnce();

    releaseSpace(editorElement());
    expect(pushToTalk.stop).toHaveBeenCalledOnce();
  });

  it("keeps the hold alive while the recording state and composer flags change", async () => {
    const pushToTalk = createPushToTalk();
    const { rerender } = render(
      <PromptBoxInternal
        {...createProps({ voice: createVoice(pushToTalk) })}
      />,
    );
    await waitFor(() => editorElement());

    pressSpace(document.body);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(pushToTalk.start).toHaveBeenCalledOnce();

    rerender(
      <PromptBoxInternal
        {...createProps({
          voice: createVoice({ ...pushToTalk, state: "starting" }),
        })}
      />,
    );
    rerender(
      <PromptBoxInternal
        {...createProps({
          value: "typed meanwhile",
          voice: createVoice({
            ...pushToTalk,
            state: "recording",
            transcript: { committedText: "", interimText: "live" },
          }),
        })}
      />,
    );
    expect(pushToTalk.cancel).not.toHaveBeenCalled();
    expect(pushToTalk.stop).not.toHaveBeenCalled();

    releaseSpace(document.body);
    expect(pushToTalk.stop).toHaveBeenCalledOnce();
    expect(pushToTalk.cancel).not.toHaveBeenCalled();
  });

  it("treats a quick tap as nothing and leaves Space alone once the composer has text", async () => {
    const pushToTalk = createPushToTalk();
    const { rerender } = render(
      <PromptBoxInternal
        {...createProps({ voice: createVoice(pushToTalk) })}
      />,
    );
    await waitFor(() => editorElement());

    pressSpace(editorElement());
    act(() => {
      vi.advanceTimersByTime(100);
    });
    releaseSpace(editorElement());
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(pushToTalk.start).not.toHaveBeenCalled();
    expect(pushToTalk.stop).not.toHaveBeenCalled();

    rerender(
      <PromptBoxInternal
        {...createProps({
          value: "Draft text",
          voice: createVoice(pushToTalk),
        })}
      />,
    );
    pressSpace(editorElement());
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(pushToTalk.start).not.toHaveBeenCalled();

    pressSpace(document.body);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(pushToTalk.start).toHaveBeenCalledOnce();
  });

  it("does nothing when push-to-talk is disabled or Space is pressed in a button", async () => {
    const pushToTalk = createPushToTalk({ enabled: false });
    const { rerender } = render(
      <PromptBoxInternal
        {...createProps({ voice: createVoice(pushToTalk) })}
      />,
    );
    await waitFor(() => editorElement());
    pressSpace(document.body);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(pushToTalk.start).not.toHaveBeenCalled();

    const enabled = createPushToTalk();
    rerender(
      <PromptBoxInternal {...createProps({ voice: createVoice(enabled) })} />,
    );
    const button = document.createElement("button");
    document.body.append(button);
    pressSpace(button);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(enabled.start).not.toHaveBeenCalled();
    button.remove();
  });

  it("shows committed and interim text distinctly while recording and cancels on Escape", async () => {
    const pushToTalk = createPushToTalk({
      state: "recording",
      transcript: {
        committedText: "Add a unit test",
        interimText: "for the handler",
      },
    });
    render(
      <PromptBoxInternal
        {...createProps({ value: "Please", voice: createVoice(pushToTalk) })}
      />,
    );
    await waitFor(() => {
      expect(
        editorElement().querySelector(`.${VOICE_INTERIM_CLASS}`)?.textContent,
      ).toBe(" Add a unit test for the handler");
    });
    expect(editorElement().textContent).toContain("Please");
    expect(screen.getByText("Release Space to finish")).toBeDefined();
    expect(editorElement().getAttribute("contenteditable")).toBe("false");

    fireEvent.keyDown(window, { key: "Escape", code: "Escape" });
    expect(pushToTalk.cancel).toHaveBeenCalledOnce();
  });

  it("removes the interim text once the hold ends", async () => {
    const recording = createPushToTalk({
      state: "recording",
      transcript: { committedText: "", interimText: "hello there" },
    });
    const { rerender } = render(
      <PromptBoxInternal {...createProps({ voice: createVoice(recording) })} />,
    );
    await waitFor(() => {
      expect(
        editorElement().querySelector(`.${VOICE_INTERIM_CLASS}`),
      ).not.toBeNull();
    });

    rerender(
      <PromptBoxInternal
        {...createProps({
          voice: createVoice(createPushToTalk({ state: "idle" })),
        })}
      />,
    );
    await waitFor(() => {
      expect(
        editorElement().querySelector(`.${VOICE_INTERIM_CLASS}`),
      ).toBeNull();
    });
  });
});
