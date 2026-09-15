import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react";
import { joinTranscriptParts } from "@/hooks/live-transcription-session";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { transcribeVoiceInput } from "@/lib/api";
import { usePushToTalkEnabled } from "@/lib/push-to-talk-preference";
import type { VoiceDelivery } from "@/lib/voice-recording-store";
import type { PromptBoxHandle, PromptVoiceConfig } from "./ComposerBox";
import {
  deliverPromptVoiceTranscript,
  type PromptVoiceDraftTarget,
} from "./prompt-voice-intent";

async function requestVoiceTranscription({
  file,
  promptContext,
  signal,
}: {
  file: File;
  promptContext?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const transcription = await transcribeVoiceInput(file, promptContext, signal);
  return transcription.text;
}

export function usePromptVoice(
  promptBoxRef: RefObject<PromptBoxHandle | null>,
  draft: PromptVoiceDraftTarget | undefined,
  recordingKey: string | null,
): PromptVoiceConfig {
  const mountedRef = useRef(true);
  const pushToTalkEnabled = usePushToTalkEnabled();
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const onTranscript = useCallback(
    (text: string, delivery: VoiceDelivery) =>
      deliverPromptVoiceTranscript(text, delivery, {
        mounted: mountedRef.current,
        promptBox: promptBoxRef.current,
        draft,
      }),
    [draft, promptBoxRef],
  );

  const getPromptContext = useCallback(
    () => promptBoxRef.current?.voice?.textBeforeCursor() ?? undefined,
    [promptBoxRef],
  );

  const playCompletionTransition = useCallback(
    () => promptBoxRef.current?.voice?.playCompletionTransition(),
    [promptBoxRef],
  );

  const voiceInput = useVoiceInput({
    recordingKey,
    onTranscript,
    onTranscribe: requestVoiceTranscription,
    getPromptContext,
    playCompletionTransition,
  });

  const { stop: stopVoiceInput } = voiceInput;
  const stop = useCallback(() => stopVoiceInput("insert"), [stopVoiceInput]);
  const send = useCallback(() => stopVoiceInput("send"), [stopVoiceInput]);

  const transcribeLive = useCallback(
    (args: { file: File; prompt?: string; signal: AbortSignal }) =>
      requestVoiceTranscription({
        file: args.file,
        ...(args.prompt === undefined ? {} : { promptContext: args.prompt }),
        signal: args.signal,
      }),
    [],
  );

  const insertPushToTalkTranscript = useCallback(
    (text: string) => onTranscript(text, "insert"),
    [onTranscript],
  );

  const pushToTalk = usePushToTalk({
    onFinalTranscript: insertPushToTalkTranscript,
    onTranscribe: transcribeLive,
    getPromptContext,
  });

  const pushToTalkTranscript = useMemo(
    () =>
      joinTranscriptParts(
        pushToTalk.snapshot.committedText,
        pushToTalk.snapshot.interimText,
      ),
    [pushToTalk.snapshot],
  );

  return useMemo<PromptVoiceConfig>(
    () => ({
      state: voiceInput.state,
      delivery: voiceInput.delivery,
      microphoneWarning: voiceInput.microphoneWarning,
      isSupported: voiceInput.isSupported,
      stream: voiceInput.stream,
      failedRecordings: voiceInput.failedRecordings,
      start: voiceInput.start,
      stop,
      send,
      retry: voiceInput.retry,
      discard: voiceInput.discard,
      download: voiceInput.download,
      cancel: voiceInput.cancel,
      pushToTalk: {
        enabled: pushToTalkEnabled && pushToTalk.isSupported,
        state: pushToTalk.state,
        stream: pushToTalk.stream,
        transcript: pushToTalkTranscript,
        start: pushToTalk.start,
        stop: pushToTalk.stop,
        cancel: pushToTalk.cancel,
      },
    }),
    [
      voiceInput.state,
      voiceInput.delivery,
      voiceInput.microphoneWarning,
      voiceInput.isSupported,
      voiceInput.stream,
      voiceInput.failedRecordings,
      voiceInput.start,
      stop,
      send,
      voiceInput.retry,
      voiceInput.discard,
      voiceInput.download,
      voiceInput.cancel,
      pushToTalkEnabled,
      pushToTalk.isSupported,
      pushToTalk.state,
      pushToTalk.stream,
      pushToTalkTranscript,
      pushToTalk.start,
      pushToTalk.stop,
      pushToTalk.cancel,
    ],
  );
}
