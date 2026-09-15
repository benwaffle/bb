import { useCallback, useEffect, useRef, useState } from "react";
import { appToast } from "@/components/ui/app-toast";
import {
  buildAudioInputConstraints,
  useAudioInputDevicePreferenceValue,
} from "@/lib/audio-input-device-preference";
import {
  LiveTranscriptionSession,
  type LiveRecorder,
  type LiveTranscribeArgs,
  type LiveTranscriptSnapshot,
} from "./live-transcription-session";
import {
  readVoiceSupportEnvironment,
  resolveVoiceSupport,
  voiceUnsupportedMessage,
} from "./voice-input-support";

export type PushToTalkState = "idle" | "starting" | "recording" | "finalizing";

export interface UsePushToTalkOptions {
  onFinalTranscript: (text: string) => void;
  onTranscribe: (args: LiveTranscribeArgs) => Promise<string>;
  getPromptContext: () => string | undefined;
}

export const EMPTY_LIVE_TRANSCRIPT: LiveTranscriptSnapshot = {
  committedText: "",
  interimText: "",
};

const MAX_HOLD_TOAST = "Push-to-talk stopped after five minutes";

function preferredMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const candidate of ["audio/webm", "audio/mp4", "audio/ogg"]) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function adaptRecorder(recorder: MediaRecorder): LiveRecorder {
  const adapted: LiveRecorder = {
    mimeType: recorder.mimeType,
    start: (timesliceMs) => recorder.start(timesliceMs),
    stop: () => recorder.stop(),
    ondataavailable: null,
    onstop: null,
    onerror: null,
  };
  recorder.ondataavailable = (event) => {
    adapted.ondataavailable?.({ data: event.data });
  };
  recorder.onstop = () => {
    adapted.onstop?.();
  };
  recorder.onerror = (event) => {
    adapted.onerror?.(event);
  };
  return adapted;
}

function recorderFactory(stream: MediaStream): () => LiveRecorder {
  const mimeType = preferredMimeType();
  return () =>
    adaptRecorder(
      mimeType === null
        ? new MediaRecorder(stream)
        : new MediaRecorder(stream, { mimeType }),
    );
}

function permissionMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone permission denied";
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "No microphone was found";
      case "NotReadableError":
      case "TrackStartError":
        return "Microphone is already in use";
      default:
        return "Failed to start voice recording";
    }
  }
  return error instanceof Error && error.message.length > 0
    ? error.message
    : "Voice input failed";
}

export function usePushToTalk(options: UsePushToTalkOptions) {
  const preferredDeviceId = useAudioInputDevicePreferenceValue();
  const [state, setState] = useState<PushToTalkState>("idle");
  const [snapshot, setSnapshot] = useState<LiveTranscriptSnapshot>(
    EMPTY_LIVE_TRANSCRIPT,
  );
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const sessionRef = useRef<LiveTranscriptionSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stateRef = useRef<PushToTalkState>("idle");
  const releaseWhileStartingRef = useRef<"none" | "stop" | "cancel">("none");
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const transition = useCallback((next: PushToTalkState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const readState = useCallback((): PushToTalkState => stateRef.current, []);

  useEffect(() => {
    setIsSupported(
      resolveVoiceSupport(readVoiceSupportEnvironment()).isSupported,
    );
  }, []);

  const releaseStream = useCallback(() => {
    const active = streamRef.current;
    streamRef.current = null;
    setStream(null);
    active?.getTracks().forEach((track) => track.stop());
  }, []);

  const reset = useCallback(() => {
    sessionRef.current = null;
    releaseStream();
    setSnapshot(EMPTY_LIVE_TRANSCRIPT);
    transition("idle");
  }, [releaseStream, transition]);

  const cancel = useCallback(() => {
    if (stateRef.current === "starting") {
      releaseWhileStartingRef.current = "cancel";
      return;
    }
    sessionRef.current?.cancel();
    reset();
  }, [reset]);

  const stop = useCallback(async () => {
    if (stateRef.current === "starting") {
      releaseWhileStartingRef.current = "stop";
      return;
    }
    const session = sessionRef.current;
    if (session === null || stateRef.current !== "recording") return;
    transition("finalizing");
    const text = await session.stop();
    if (sessionRef.current !== session) return;
    reset();
    if (text.length > 0) {
      optionsRef.current.onFinalTranscript(text);
    }
  }, [reset, transition]);

  const start = useCallback(async () => {
    if (stateRef.current !== "idle") return;
    if (!isSupported) {
      appToast.error("Voice input failed", {
        description: voiceUnsupportedMessage(
          resolveVoiceSupport(readVoiceSupportEnvironment()).reason,
        ),
      });
      return;
    }
    transition("starting");
    releaseWhileStartingRef.current = "none";
    let mediaStream: MediaStream;
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(
        buildAudioInputConstraints(preferredDeviceId),
      );
    } catch (error) {
      transition("idle");
      appToast.error("Voice input failed", {
        description: permissionMessage(error),
      });
      return;
    }
    if (
      readState() !== "starting" ||
      releaseWhileStartingRef.current !== "none"
    ) {
      mediaStream.getTracks().forEach((track) => track.stop());
      transition("idle");
      return;
    }
    streamRef.current = mediaStream;
    setStream(mediaStream);
    const session = new LiveTranscriptionSession({
      createRecorder: recorderFactory(mediaStream),
      transcribe: (args) => optionsRef.current.onTranscribe(args),
      getPromptContext: () => optionsRef.current.getPromptContext(),
      onSnapshot: (next) => {
        if (sessionRef.current === session) setSnapshot(next);
      },
      onRecorderError: () => {
        if (sessionRef.current !== session) return;
        reset();
        appToast.error("Voice input failed", {
          description: "Voice recording failed",
        });
      },
      onMaxDuration: () => {
        if (sessionRef.current !== session) return;
        appToast.message(MAX_HOLD_TOAST);
        void stop();
      },
    });
    sessionRef.current = session;
    transition("recording");
    session.start();
  }, [isSupported, preferredDeviceId, readState, reset, stop, transition]);

  useEffect(() => {
    return () => {
      sessionRef.current?.cancel();
      sessionRef.current = null;
      const active = streamRef.current;
      streamRef.current = null;
      active?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return {
    state,
    snapshot,
    stream,
    isSupported,
    start,
    stop,
    cancel,
  };
}
