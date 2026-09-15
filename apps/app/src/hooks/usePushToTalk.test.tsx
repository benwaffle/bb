// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { appToast } from "@/components/ui/app-toast";
import { usePushToTalk } from "./usePushToTalk";

vi.mock("@/components/ui/app-toast", () => ({
  appToast: { error: vi.fn(), message: vi.fn() },
}));
vi.mock("@/lib/audio-input-device-preference", () => ({
  useAudioInputDevicePreferenceValue: () => null,
  buildAudioInputConstraints: () => ({ audio: true }),
}));

class Recorder {
  static isTypeSupported = () => true;
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  start() {}
  stop() {
    this.ondataavailable?.({ data: new Blob(["recorded audio"]) });
    queueMicrotask(() => this.onstop?.());
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("MediaRecorder", Recorder);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("shows the server's error when the final transcription fails without a preview", async () => {
  const onFinalTranscript = vi.fn();
  const { result } = renderHook(() =>
    usePushToTalk({
      onFinalTranscript,
      onTranscribe: vi
        .fn()
        .mockRejectedValue(new Error("Voice transcription timed out")),
      getPromptContext: () => undefined,
    }),
  );
  await act(() => result.current.start());
  expect(result.current.state).toBe("recording");

  await act(() => result.current.stop());

  expect(result.current.state).toBe("idle");
  expect(onFinalTranscript).not.toHaveBeenCalled();
  expect(appToast.error).toHaveBeenCalledWith("Voice input failed", {
    description: "Voice transcription timed out",
  });
});
