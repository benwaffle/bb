import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LiveTranscriptionSession,
  type LiveRecorder,
  type LiveTranscribeArgs,
  type LiveTranscriptSnapshot,
} from "./live-transcription-session";

class FakeRecorder implements LiveRecorder {
  readonly mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  started = false;
  stopped = false;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
    queueMicrotask(() => this.onstop?.());
  }

  emitChunk(bytes = 4): void {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)]) });
  }
}

interface Harness {
  session: LiveTranscriptionSession;
  recorders: FakeRecorder[];
  requests: Array<{
    args: LiveTranscribeArgs;
    resolve: (text: string) => void;
    reject: (error: Error) => void;
  }>;
  snapshots: LiveTranscriptSnapshot[];
  onMaxDuration: ReturnType<typeof vi.fn>;
  onRecorderError: ReturnType<typeof vi.fn>;
}

function createHarness(
  overrides: Partial<
    ConstructorParameters<typeof LiveTranscriptionSession>[0]
  > = {},
): Harness {
  const recorders: FakeRecorder[] = [];
  const requests: Harness["requests"] = [];
  const snapshots: LiveTranscriptSnapshot[] = [];
  const onMaxDuration = vi.fn();
  const onRecorderError = vi.fn();
  const session = new LiveTranscriptionSession({
    createRecorder: () => {
      const recorder = new FakeRecorder();
      recorders.push(recorder);
      return recorder;
    },
    transcribe: (args) =>
      new Promise<string>((resolve, reject) => {
        requests.push({ args, resolve, reject });
      }),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onRecorderError,
    onMaxDuration,
    getPromptContext: () => "Context before cursor",
    segmentMaxMs: 5_000,
    interimIntervalMs: 1_000,
    minTranscribableMs: 500,
    maxDurationMs: 60_000,
    ...overrides,
  });
  return {
    session,
    recorders,
    requests,
    snapshots,
    onMaxDuration,
    onRecorderError,
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function lastSnapshot(harness: Harness): LiveTranscriptSnapshot | undefined {
  return harness.snapshots[harness.snapshots.length - 1];
}

describe("LiveTranscriptionSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("re-transcribes the accumulated segment about once a second and replaces the interim text", async () => {
    const harness = createHarness();
    harness.session.start();
    const recorder = harness.recorders[0];
    if (recorder === undefined) throw new Error("no recorder");
    expect(recorder.started).toBe(true);

    recorder.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0]?.args.prompt).toBe("Context before cursor");
    expect(harness.requests[0]?.args.file.type).toBe("audio/webm");

    recorder.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.requests).toHaveLength(1);

    harness.requests[0]?.resolve(" Add a  unit test ");
    await flush();
    expect(lastSnapshot(harness)).toEqual({
      committedText: "",
      interimText: "Add a unit test",
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.requests).toHaveLength(2);
    harness.requests[1]?.resolve("Add a unit test for the handler");
    await flush();
    expect(lastSnapshot(harness)?.interimText).toBe(
      "Add a unit test for the handler",
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(harness.requests).toHaveLength(2);
  });

  it("rotates segments at the cap, commits the finished segment, and keeps recording", async () => {
    const harness = createHarness();
    harness.session.start();
    const first = harness.recorders[0];
    if (first === undefined) throw new Error("no recorder");
    first.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    harness.requests[0]?.resolve("first part");
    await flush();

    await vi.advanceTimersByTimeAsync(4_000);
    expect(first.stopped).toBe(true);
    expect(harness.recorders).toHaveLength(2);
    const second = harness.recorders[1];
    if (second === undefined) throw new Error("no second recorder");
    expect(second.started).toBe(true);
    await flush();
    const commitRequest = harness.requests[harness.requests.length - 1];
    expect(commitRequest?.args.signal.aborted).toBe(false);
    commitRequest?.resolve("First part, final.");
    await flush();
    expect(lastSnapshot(harness)).toEqual({
      committedText: "First part, final.",
      interimText: "",
    });

    second.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    const interim = harness.requests[harness.requests.length - 1];
    expect(interim?.args.prompt).toBe(
      "Context before cursor First part, final.",
    );
    interim?.resolve("second part");
    await flush();

    const stopping = harness.session.stop();
    await flush();
    expect(second.stopped).toBe(true);
    const finalRequest = harness.requests[harness.requests.length - 1];
    finalRequest?.resolve("Second part.");
    await expect(stopping).resolves.toBe("First part, final. Second part.");
    expect(harness.session.getState()).toBe("done");
  });

  it("falls back to the last interim text when the final transcription fails", async () => {
    const harness = createHarness();
    harness.session.start();
    const recorder = harness.recorders[0];
    if (recorder === undefined) throw new Error("no recorder");
    recorder.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    harness.requests[0]?.resolve("almost done");
    await flush();

    const stopping = harness.session.stop();
    await flush();
    harness.requests[1]?.reject(new Error("HTTP 504"));
    await expect(stopping).resolves.toBe("almost done");
  });

  it("aborts an in-flight interim request when the hold ends and never applies its result", async () => {
    const harness = createHarness();
    harness.session.start();
    const recorder = harness.recorders[0];
    if (recorder === undefined) throw new Error("no recorder");
    recorder.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    const interim = harness.requests[0];
    if (interim === undefined) throw new Error("no interim request");

    const stopping = harness.session.stop();
    expect(interim.args.signal.aborted).toBe(true);
    interim.resolve("stale interim");
    await flush();
    harness.requests[1]?.resolve("final words");
    await expect(stopping).resolves.toBe("final words");
    expect(
      harness.snapshots.some(
        (snapshot) => snapshot.interimText === "stale interim",
      ),
    ).toBe(false);
  });

  it("discards everything on cancel, including the pending final transcription", async () => {
    const harness = createHarness();
    harness.session.start();
    const recorder = harness.recorders[0];
    if (recorder === undefined) throw new Error("no recorder");
    recorder.emitChunk();
    await vi.advanceTimersByTimeAsync(1_000);
    harness.session.cancel();
    expect(recorder.stopped).toBe(true);
    expect(harness.requests[0]?.args.signal.aborted).toBe(true);
    expect(harness.session.getState()).toBe("cancelled");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(harness.requests).toHaveLength(1);
  });

  it("does not request a transcription before any audio has arrived or without new chunks", async () => {
    const harness = createHarness();
    harness.session.start();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(harness.requests).toHaveLength(0);
  });

  it("notifies once when the maximum hold duration passes", async () => {
    const harness = createHarness({ maxDurationMs: 2_500 });
    harness.session.start();
    await vi.advanceTimersByTimeAsync(2_499);
    expect(harness.onMaxDuration).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.onMaxDuration).toHaveBeenCalledOnce();
  });

  it("cancels and reports when the recorder errors", async () => {
    const harness = createHarness();
    harness.session.start();
    harness.recorders[0]?.onerror?.(new Error("device lost"));
    expect(harness.onRecorderError).toHaveBeenCalledOnce();
    expect(harness.session.getState()).toBe("cancelled");
  });
});
