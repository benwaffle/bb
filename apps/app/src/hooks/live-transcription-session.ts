export interface LiveRecorder {
  readonly mimeType: string;
  start(timesliceMs: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface LiveTranscriptSnapshot {
  readonly committedText: string;
  readonly interimText: string;
}

export interface LiveTranscribeArgs {
  file: File;
  prompt?: string;
  signal: AbortSignal;
}

export type LiveTranscriptionSessionState =
  | "idle"
  | "recording"
  | "finalizing"
  | "done"
  | "cancelled";

export interface LiveTranscriptionSessionOptions {
  createRecorder(): LiveRecorder;
  transcribe(args: LiveTranscribeArgs): Promise<string>;
  onSnapshot(snapshot: LiveTranscriptSnapshot): void;
  onRecorderError(): void;
  onMaxDuration(): void;
  getPromptContext(): string | undefined;
  segmentMaxMs?: number;
  interimIntervalMs?: number;
  maxDurationMs?: number;
  chunkTimesliceMs?: number;
  minTranscribableMs?: number;
  now?: () => number;
}

interface Segment {
  readonly id: number;
  readonly recorder: LiveRecorder;
  readonly startedAt: number;
  readonly chunks: Blob[];
  readonly stopped: Promise<void>;
  interimText: string;
  interimChunkCount: number;
  finishStopped: () => void;
}

export const DEFAULT_SEGMENT_MAX_MS = 20_000;
export const DEFAULT_INTERIM_INTERVAL_MS = 1_000;
export const DEFAULT_MAX_DURATION_MS = 5 * 60_000;
const DEFAULT_CHUNK_TIMESLICE_MS = 250;
const DEFAULT_MIN_TRANSCRIBABLE_MS = 700;
const PROMPT_CONTEXT_MAX_CHARS = 400;

export function normalizeLiveTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function joinTranscriptParts(...parts: readonly string[]): string {
  return parts
    .map(normalizeLiveTranscript)
    .filter((part) => part.length > 0)
    .join(" ");
}

function recordingFileName(mimeType: string): string {
  if (mimeType.includes("ogg")) return "recording.ogg";
  if (mimeType.includes("mp4")) return "recording.mp4";
  return "recording.webm";
}

function tailOf(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : text.slice(text.length - maxChars);
}

export class LiveTranscriptionSession {
  private readonly options: Required<
    Pick<
      LiveTranscriptionSessionOptions,
      | "segmentMaxMs"
      | "interimIntervalMs"
      | "maxDurationMs"
      | "chunkTimesliceMs"
      | "minTranscribableMs"
      | "now"
    >
  > &
    LiveTranscriptionSessionOptions;

  private state: LiveTranscriptionSessionState = "idle";
  private current: Segment | null = null;
  private nextSegmentId = 1;
  private committedText = "";
  private committedChain: Promise<void> = Promise.resolve();
  private interimTimer: ReturnType<typeof setInterval> | null = null;
  private maxDurationTimer: ReturnType<typeof setTimeout> | null = null;
  private interimAbort: AbortController | null = null;
  private readonly finalAbort = new AbortController();

  constructor(options: LiveTranscriptionSessionOptions) {
    this.options = {
      segmentMaxMs: DEFAULT_SEGMENT_MAX_MS,
      interimIntervalMs: DEFAULT_INTERIM_INTERVAL_MS,
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      chunkTimesliceMs: DEFAULT_CHUNK_TIMESLICE_MS,
      minTranscribableMs: DEFAULT_MIN_TRANSCRIBABLE_MS,
      now: () => Date.now(),
      ...options,
    };
  }

  getState(): LiveTranscriptionSessionState {
    return this.state;
  }

  private isCancelled(): boolean {
    return this.getState() === "cancelled";
  }

  getSnapshot(): LiveTranscriptSnapshot {
    return {
      committedText: this.committedText,
      interimText: this.current?.interimText ?? "",
    };
  }

  start(): void {
    if (this.state !== "idle") return;
    this.state = "recording";
    this.startSegment();
    this.interimTimer = setInterval(() => {
      this.tick();
    }, this.options.interimIntervalMs);
    this.maxDurationTimer = setTimeout(() => {
      this.maxDurationTimer = null;
      if (this.state === "recording") this.options.onMaxDuration();
    }, this.options.maxDurationMs);
    this.publish();
  }

  async stop(): Promise<string> {
    if (this.state !== "recording") {
      return this.committedText;
    }
    this.state = "finalizing";
    this.clearTimers();
    this.interimAbort?.abort();
    this.interimAbort = null;
    const segment = this.current;
    this.current = null;
    if (segment !== null) {
      this.queueCommit(segment);
    }
    await this.committedChain;
    if (this.getState() !== "finalizing") {
      return "";
    }
    this.state = "done";
    this.publish();
    return this.committedText;
  }

  cancel(): void {
    if (this.state === "done" || this.state === "cancelled") return;
    this.state = "cancelled";
    this.clearTimers();
    this.interimAbort?.abort();
    this.interimAbort = null;
    this.finalAbort.abort();
    const segment = this.current;
    this.current = null;
    if (segment !== null) {
      this.stopRecorder(segment);
    }
  }

  private clearTimers(): void {
    if (this.interimTimer !== null) {
      clearInterval(this.interimTimer);
      this.interimTimer = null;
    }
    if (this.maxDurationTimer !== null) {
      clearTimeout(this.maxDurationTimer);
      this.maxDurationTimer = null;
    }
  }

  private publish(): void {
    this.options.onSnapshot(this.getSnapshot());
  }

  private startSegment(): void {
    const recorder = this.options.createRecorder();
    let finishStopped: () => void = () => {};
    const stopped = new Promise<void>((resolve) => {
      finishStopped = resolve;
    });
    const segment: Segment = {
      id: this.nextSegmentId,
      recorder,
      startedAt: this.options.now(),
      chunks: [],
      stopped,
      interimText: "",
      interimChunkCount: 0,
      finishStopped,
    };
    this.nextSegmentId += 1;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        segment.chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      segment.finishStopped();
    };
    recorder.onerror = () => {
      segment.finishStopped();
      if (this.state === "recording") {
        this.cancel();
        this.options.onRecorderError();
      }
    };
    this.current = segment;
    try {
      recorder.start(this.options.chunkTimesliceMs);
    } catch {
      this.cancel();
      this.options.onRecorderError();
    }
  }

  private stopRecorder(segment: Segment): void {
    try {
      segment.recorder.stop();
    } catch {
      segment.finishStopped();
    }
  }

  private tick(): void {
    if (this.state !== "recording") return;
    const segment = this.current;
    if (segment === null) return;
    const elapsed = this.options.now() - segment.startedAt;
    if (elapsed >= this.options.segmentMaxMs) {
      this.rotateSegment(segment);
      return;
    }
    if (this.interimAbort !== null) return;
    if (elapsed < this.options.minTranscribableMs) return;
    if (segment.chunks.length === segment.interimChunkCount) return;
    void this.requestInterim(segment);
  }

  private rotateSegment(finished: Segment): void {
    this.interimAbort?.abort();
    this.interimAbort = null;
    this.startSegment();
    this.queueCommit(finished);
  }

  private queueCommit(segment: Segment): void {
    this.stopRecorder(segment);
    this.committedChain = this.committedChain.then(async () => {
      await segment.stopped;
      if (this.isCancelled()) return;
      const text = await this.transcribeSegment(segment);
      if (this.isCancelled()) return;
      this.committedText = joinTranscriptParts(this.committedText, text);
      this.publish();
    });
  }

  private async transcribeSegment(segment: Segment): Promise<string> {
    if (segment.chunks.length === 0) return "";
    try {
      return await this.options.transcribe({
        file: this.fileFor(segment),
        ...this.promptFor(),
        signal: this.finalAbort.signal,
      });
    } catch {
      return segment.interimText;
    }
  }

  private async requestInterim(segment: Segment): Promise<void> {
    const controller = new AbortController();
    this.interimAbort = controller;
    const chunkCount = segment.chunks.length;
    try {
      const text = await this.options.transcribe({
        file: this.fileFor(segment),
        ...this.promptFor(),
        signal: controller.signal,
      });
      if (controller.signal.aborted || this.current !== segment) return;
      segment.interimText = normalizeLiveTranscript(text);
      segment.interimChunkCount = chunkCount;
      this.publish();
    } catch {
      if (!controller.signal.aborted && this.current === segment) {
        segment.interimChunkCount = chunkCount;
      }
    } finally {
      if (this.interimAbort === controller) {
        this.interimAbort = null;
      }
    }
  }

  private fileFor(segment: Segment): File {
    const mimeType = segment.recorder.mimeType || "audio/webm";
    return new File(
      [new Blob(segment.chunks, { type: mimeType })],
      recordingFileName(mimeType),
      {
        type: mimeType,
      },
    );
  }

  private promptFor(): { prompt?: string } {
    const prompt = tailOf(
      joinTranscriptParts(
        this.options.getPromptContext() ?? "",
        this.committedText,
      ),
      PROMPT_CONTEXT_MAX_CHARS,
    );
    return prompt.length > 0 ? { prompt } : {};
  }
}
