// @vitest-environment jsdom

import type { ComponentProps } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as renderWithoutProviders,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalComposerPushToTalk } from "@get-bb/plugin-sdk/app";
import { resetAllCrashedPluginSlotsForTest } from "@/components/plugin/PluginSlotMount";
import { resetPluginSlotStoreForTest } from "@/lib/plugin-slots";
import { registerComposerPlugin } from "@/test/fixtures/composer-plugin";
import { testTypeaheadConfig } from "@/test/fixtures/composer-search";
import { ComposerTestProviders } from "@/test/fixtures/composer-test-providers";
import { ComposerBox, type PromptVoiceConfig } from "./ComposerBox";

vi.mock("@/hooks/usePromptMentions", async () =>
  (await import("@/test/fixtures/composer-search")).fakePromptMentionsModule(),
);
vi.mock("@/hooks/useCommandSuggestions", async () =>
  (
    await import("@/test/fixtures/composer-search")
  ).fakeCommandSuggestionsModule(),
);

const VOICE_INTERIM_CLASS = "prompt-voice-interim";

const render = (
  ui: Parameters<typeof renderWithoutProviders>[0],
  options?: Parameters<typeof renderWithoutProviders>[1],
) => renderWithoutProviders(ui, { wrapper: ComposerTestProviders, ...options });

type PromptBoxProps = ComponentProps<typeof ComposerBox>;

function createProps(overrides: Partial<PromptBoxProps> = {}): PromptBoxProps {
  return {
    value: "",
    mentionRanges: [],
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    surface: "thread",
    mentionMenuPlacement: "bottom",
    typeahead: testTypeaheadConfig(),
    ...overrides,
  };
}

function createPushToTalk(
  overrides: Partial<ExperimentalComposerPushToTalk> = {},
): ExperimentalComposerPushToTalk {
  return {
    enabled: true,
    state: "idle",
    stream: null,
    transcript: "",
    start: vi.fn(),
    stop: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
}

function createVoice(pushToTalk: ExperimentalComposerPushToTalk): PromptVoiceConfig {
  return {
    state: "idle",
    delivery: "insert",
    isSupported: true,
    stream: null,
    failedRecordings: [],
    start: vi.fn(),
    stop: vi.fn(),
    send: vi.fn(),
    retry: vi.fn(),
    discard: vi.fn(),
    download: vi.fn(),
    cancel: vi.fn(),
    microphoneWarning: null,
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

beforeEach(async () => {
  await registerComposerPlugin();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  resetPluginSlotStoreForTest();
  resetAllCrashedPluginSlotsForTest();
});

describe("ComposerBox push-to-talk", () => {
  it("starts after holding Space in an empty composer and stops on release", async () => {
    const pushToTalk = createPushToTalk();
    render(
      <ComposerBox
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
      <ComposerBox
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
      <ComposerBox
        {...createProps({
          voice: createVoice({ ...pushToTalk, state: "starting" }),
        })}
      />,
    );
    rerender(
      <ComposerBox
        {...createProps({
          value: "typed meanwhile",
          voice: createVoice({
            ...pushToTalk,
            state: "recording",
            transcript: "live",
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
      <ComposerBox
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
      <ComposerBox
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
      <ComposerBox
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
      <ComposerBox {...createProps({ voice: createVoice(enabled) })} />,
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
      transcript: "Add a unit test for the handler",
    });
    render(
      <ComposerBox
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
      transcript: "hello there",
    });
    const { rerender } = render(
      <ComposerBox {...createProps({ voice: createVoice(recording) })} />,
    );
    await waitFor(() => {
      expect(
        editorElement().querySelector(`.${VOICE_INTERIM_CLASS}`),
      ).not.toBeNull();
    });

    rerender(
      <ComposerBox
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
