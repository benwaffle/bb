import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { transcribeVoiceInput } from "@/lib/api";
import { usePushToTalkEnabled } from "@/lib/push-to-talk-preference";
import type { PromptBoxHandle, PromptVoiceConfig } from "./PromptBoxInternal";
import {
  createPromptVoiceIntent,
  transcribeAfterCompletionTransition,
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
  draft?: PromptVoiceDraftTarget,
): PromptVoiceConfig {
  const pushToTalkEnabled = usePushToTalkEnabled();
  const [intent] = useState(createPromptVoiceIntent);
  useEffect(() => {
    intent.setMounted(true);
    return () => {
      intent.setMounted(false);
    };
  }, [intent]);

  const onTranscript = useCallback(
    (text: string) =>
      intent.deliverTranscript(text, {
        promptBox: promptBoxRef.current,
        draft,
      }),
    [draft, intent, promptBoxRef],
  );

  const getPromptContext = useCallback(
    () => promptBoxRef.current?.getTextBeforeCursor(),
    [promptBoxRef],
  );

  const onTranscribe = useCallback(
    (args: Parameters<typeof requestVoiceTranscription>[0]) =>
      transcribeAfterCompletionTransition(
        () => requestVoiceTranscription(args),
        () => promptBoxRef.current?.playVoiceCompletionTransition(),
        args.signal,
      ),
    [promptBoxRef],
  );

  const voiceInput = useVoiceInput({
    onTranscript,
    onTranscribe,
    getPromptContext,
  });

  const stop = useCallback(() => {
    if (intent.claimStop(voiceInput.state, false)) voiceInput.stop();
  }, [intent, voiceInput]);
  const send = useCallback(() => {
    if (intent.claimStop(voiceInput.state, true)) voiceInput.stop();
  }, [intent, voiceInput]);
  const cancel = useCallback(() => {
    intent.cancel();
    voiceInput.cancel();
  }, [intent, voiceInput]);
  useEffect(() => {
    intent.settle(voiceInput.state);
  }, [intent, voiceInput.state]);

  const transcribeLive = useCallback(
    (args: { file: File; prompt?: string; signal: AbortSignal }) =>
      requestVoiceTranscription({
        file: args.file,
        ...(args.prompt === undefined ? {} : { promptContext: args.prompt }),
        signal: args.signal,
      }),
    [],
  );

  const pushToTalk = usePushToTalk({
    onFinalTranscript: onTranscript,
    onTranscribe: transcribeLive,
    getPromptContext,
  });

  return useMemo<PromptVoiceConfig>(
    () => ({
      state: voiceInput.state,
      microphoneWarning: voiceInput.microphoneWarning,
      isSupported: voiceInput.isSupported,
      stream: voiceInput.stream,
      start: voiceInput.start,
      stop,
      send,
      cancel,
      pushToTalk: {
        enabled: pushToTalkEnabled && pushToTalk.isSupported,
        state: pushToTalk.state,
        stream: pushToTalk.stream,
        transcript: pushToTalk.snapshot,
        start: pushToTalk.start,
        stop: pushToTalk.stop,
        cancel: pushToTalk.cancel,
      },
    }),
    [
      voiceInput.state,
      voiceInput.microphoneWarning,
      voiceInput.isSupported,
      voiceInput.stream,
      voiceInput.start,
      stop,
      send,
      cancel,
      pushToTalkEnabled,
      pushToTalk.isSupported,
      pushToTalk.state,
      pushToTalk.stream,
      pushToTalk.snapshot,
      pushToTalk.start,
      pushToTalk.stop,
      pushToTalk.cancel,
    ],
  );
}
