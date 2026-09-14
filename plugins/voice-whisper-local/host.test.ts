import { EventEmitter } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { experimental_createHostEntryHarness } from "@get-bb/plugin-sdk/testing/host";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWhisperHostEntry, type SpawnedProcess } from "./host.js";

interface SpawnCall {
  readonly command: string;
  readonly args: readonly string[];
}

type CommandScript = (
  call: SpawnCall,
  child: FakeChild,
) => void | Promise<void>;

class FakeChild extends EventEmitter implements SpawnedProcess {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killedWith: NodeJS.Signals | null = null;

  kill(signal: NodeJS.Signals): boolean {
    this.killedWith = signal;
    this.finish(null);
    return true;
  }

  finish(code: number | null): void {
    this.stdout.end();
    this.stderr.end();
    this.emit("close", code);
  }

  succeed(stdout = ""): void {
    this.stdout.write(stdout);
    this.finish(0);
  }

  fail(code: number, stderr: string): void {
    this.stderr.write(stderr);
    this.finish(code);
  }
}

function createSpawn(script: CommandScript) {
  const calls: SpawnCall[] = [];
  const spawn = (command: string, args: readonly string[]): SpawnedProcess => {
    const child = new FakeChild();
    const call = { command, args: [...args] };
    calls.push(call);
    queueMicrotask(() => {
      void script(call, child);
    });
    return child;
  };
  return { calls, spawn };
}

function basename(command: string): string {
  return path.basename(command);
}

const TRANSCRIBE_INPUT = {
  serviceId: "whisper",
  model: "base.en",
  audioBase64: Buffer.from("fake-webm-bytes").toString("base64"),
  mimeType: "audio/webm",
  filename: "voice-input.webm",
  prompt: "bb, useEffect",
  timeoutMs: 5_000,
};

describe("whisper host entry", () => {
  let root: string;
  let binDir: string;
  let dataDir: string;
  let tempDir: string;
  let env: NodeJS.ProcessEnv;

  async function installTool(name: string): Promise<string> {
    const filePath = path.join(binDir, name);
    await writeFile(filePath, "#!/bin/sh\nexit 0\n");
    await chmod(filePath, 0o755);
    return filePath;
  }

  async function installModel(name: string, bytes = 16): Promise<string> {
    const modelDir = path.join(dataDir, "models");
    await mkdir(modelDir, { recursive: true });
    const filePath = path.join(modelDir, `ggml-${name}.bin`);
    await writeFile(filePath, Buffer.alloc(bytes, 1));
    return filePath;
  }

  function harnessFor(
    spawn: (command: string, args: readonly string[]) => SpawnedProcess,
    fetch: (
      url: string,
      init: { signal: AbortSignal },
    ) => Promise<Response> = () => Promise.reject(new Error("no network")),
  ) {
    return experimental_createHostEntryHarness(
      createWhisperHostEntry({ env, fallbackBinDirs: [], spawn, fetch }),
      { experimental_paths: { dataDir, tempDir } },
    );
  }

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "whisper-host-test-"));
    binDir = path.join(root, "bin");
    dataDir = path.join(root, "data");
    tempDir = path.join(root, "tmp");
    await mkdir(binDir, { recursive: true });
    env = { PATH: binDir };
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("converts the recording with ffmpeg and returns whisper-cli's text", async () => {
    const ffmpeg = await installTool("ffmpeg");
    const whisperCli = await installTool("whisper-cli");
    const modelPath = await installModel("base.en");
    const { calls, spawn } = createSpawn(async (call, child) => {
      if (basename(call.command) === "ffmpeg") {
        const wavPath = call.args[call.args.length - 1];
        if (wavPath === undefined) throw new Error("missing wav path");
        await writeFile(wavPath, "RIFF");
        child.succeed();
        return;
      }
      child.stderr.write("load_backend: loaded MTL backend\n");
      child.succeed("\n Add a unit test.\n And clean up  the recorder.\n");
    });
    const harness = harnessFor(spawn);

    const result = await harness.experimental_call(
      "ai.voice.transcribe",
      TRANSCRIBE_INPUT,
    );

    expect(result).toEqual({
      ok: true,
      model: "base.en",
      text: "Add a unit test. And clean up the recorder.",
    });
    expect(calls.map((call) => call.command)).toEqual([ffmpeg, whisperCli]);
    const [ffmpegCall, whisperCall] = calls;
    expect(ffmpegCall?.args).toEqual(
      expect.arrayContaining(["-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le"]),
    );
    expect(ffmpegCall?.args[ffmpegCall.args.indexOf("-i") + 1]).toMatch(
      /input\.webm$/,
    );
    expect(whisperCall?.args).toEqual([
      "-m",
      modelPath,
      "-f",
      expect.stringMatching(/input\.wav$/),
      "--no-timestamps",
      "--no-prints",
      "--prompt",
      "bb, useEffect",
    ]);
    await expect(readdir(tempDir)).resolves.toEqual([]);
    await harness.experimental_dispose();
  });

  it("auto-detects the language for multilingual models and omits empty prompts", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    await installModel("small");
    const { calls, spawn } = createSpawn(async (call, child) => {
      if (basename(call.command) === "ffmpeg") {
        await writeFile(call.args[call.args.length - 1] ?? "", "RIFF");
      }
      child.succeed(" Hola.\n");
    });
    const harness = harnessFor(spawn);

    await expect(
      harness.experimental_call("ai.voice.transcribe", {
        ...TRANSCRIBE_INPUT,
        model: "small",
        prompt: null,
      }),
    ).resolves.toEqual({ ok: true, model: "small", text: "Hola." });
    const whisperArgs = calls[1]?.args ?? [];
    expect(whisperArgs).toEqual(expect.arrayContaining(["--language", "auto"]));
    expect(whisperArgs).not.toContain("--prompt");
    await harness.experimental_dispose();
  });

  it("explains how to download a missing model without running anything", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    const { calls, spawn } = createSpawn((_call, child) => child.succeed());
    const harness = harnessFor(spawn);

    const result = await harness.experimental_call(
      "ai.voice.transcribe",
      TRANSCRIBE_INPUT,
    );

    expect(result).toMatchObject({
      ok: false,
      code: "request_failed",
      message: expect.stringContaining("bb whisper prepare base.en"),
    });
    expect(calls).toEqual([]);
    await harness.experimental_dispose();
  });

  it("reports missing whisper.cpp with an install hint", async () => {
    await installTool("ffmpeg");
    await installModel("base.en");
    const { spawn } = createSpawn((_call, child) => child.succeed());
    const harness = harnessFor(spawn);

    await expect(
      harness.experimental_call("ai.voice.transcribe", TRANSCRIBE_INPUT),
    ).resolves.toMatchObject({
      ok: false,
      code: "request_failed",
      message: expect.stringContaining("brew install whisper.cpp"),
    });
    await harness.experimental_dispose();
  });

  it("reports a cancelled request instead of a tool failure when the caller aborts", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    await installModel("base.en");
    const controller = new AbortController();
    const { spawn } = createSpawn(async (call, child) => {
      if (basename(call.command) === "ffmpeg") {
        await writeFile(call.args[call.args.length - 1] ?? "", "RIFF");
        child.succeed();
        return;
      }
      controller.abort();
    });
    const harness = harnessFor(spawn);

    await expect(
      harness.experimental_call("ai.voice.transcribe", TRANSCRIBE_INPUT, {
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      ok: false,
      code: "request_failed",
      message: "Transcription was cancelled",
    });
    await harness.experimental_dispose();
  });

  it("kills a hung whisper-cli at the deadline and reports a timeout", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    await installModel("base.en");
    const hung: { child: FakeChild | null } = { child: null };
    const { spawn } = createSpawn(async (call, child) => {
      if (basename(call.command) === "ffmpeg") {
        await writeFile(call.args[call.args.length - 1] ?? "", "RIFF");
        child.succeed();
        return;
      }
      hung.child = child;
    });
    const harness = harnessFor(spawn);

    const result = await harness.experimental_call("ai.voice.transcribe", {
      ...TRANSCRIBE_INPUT,
      timeoutMs: 60,
    });

    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(hung.child?.killedWith).toBe("SIGKILL");
    await expect(readdir(tempDir)).resolves.toEqual([]);
    await harness.experimental_dispose();
  });

  it("surfaces ffmpeg failures with the tail of its stderr", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    await installModel("base.en");
    const { spawn } = createSpawn((_call, child) =>
      child.fail(1, "Invalid data found when processing input"),
    );
    const harness = harnessFor(spawn);

    await expect(
      harness.experimental_call("ai.voice.transcribe", TRANSCRIBE_INPUT),
    ).resolves.toEqual({
      ok: false,
      code: "request_failed",
      message: "ffmpeg exited with 1: Invalid data found when processing input",
    });
    await harness.experimental_dispose();
  });

  it("rejects requests for other AI services and inference", async () => {
    const { spawn } = createSpawn((_call, child) => child.succeed());
    const harness = harnessFor(spawn);

    await expect(
      harness.experimental_call("ai.voice.transcribe", {
        ...TRANSCRIBE_INPUT,
        serviceId: "codex",
      }),
    ).resolves.toMatchObject({ ok: false, code: "request_failed" });
    await expect(
      harness.experimental_call("ai.inference.complete", {
        serviceId: "whisper",
        model: "base.en",
        reasoningEffort: "none",
        prompt: "hello",
        outputSchema: { type: "object" },
        timeoutMs: 1_000,
      }),
    ).resolves.toMatchObject({ ok: false, code: "request_failed" });
    await harness.experimental_dispose();
  });

  it("lists resolved tools and downloaded models in status", async () => {
    const whisperCli = await installTool("whisper-cli");
    const basePath = await installModel("base.en", 32);
    const smallPath = await installModel("small.en", 64);
    await writeFile(path.join(dataDir, "models", "notes.txt"), "ignored");
    const { spawn } = createSpawn((_call, child) => child.succeed());
    const harness = harnessFor(spawn);

    await expect(harness.experimental_call("status", null)).resolves.toEqual({
      whisperCli,
      ffmpeg: null,
      modelDir: path.join(dataDir, "models"),
      models: [
        { name: "base.en", path: basePath, sizeBytes: 32 },
        { name: "small.en", path: smallPath, sizeBytes: 64 },
      ],
    });
    await harness.experimental_dispose();
  });

  it("treats an empty model file as missing", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    await installModel("base.en", 0);
    const { calls, spawn } = createSpawn(async (call, child) => {
      if (basename(call.command) === "ffmpeg") {
        await writeFile(call.args[call.args.length - 1] ?? "", "RIFF");
      }
      child.succeed();
    });
    const fetch = vi.fn(async () => new Response(Buffer.alloc(8, 3)));
    const harness = harnessFor(spawn, fetch);

    await expect(
      harness.experimental_call("ai.voice.transcribe", TRANSCRIBE_INPUT),
    ).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("bb whisper prepare base.en"),
    });
    expect(calls).toEqual([]);

    const prepared = await harness.experimental_call("prepareModel", {
      model: "base.en",
    });
    expect(prepared.downloaded).toBe(true);
    expect(prepared.model.sizeBytes).toBe(8);
    expect(fetch).toHaveBeenCalledOnce();
    await harness.experimental_dispose();
  });

  it("downloads a missing model once and warms it up", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    const { calls, spawn } = createSpawn(async (call, child) => {
      if (basename(call.command) === "ffmpeg") {
        await writeFile(call.args[call.args.length - 1] ?? "", "RIFF");
      }
      child.succeed();
    });
    const fetch = vi.fn(async (url: string) => {
      expect(url).toBe(
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
      );
      return new Response(Buffer.alloc(24, 7));
    });
    const harness = harnessFor(spawn, fetch);

    const first = await harness.experimental_call("prepareModel", {
      model: "tiny.en",
    });
    expect(first).toEqual({
      model: {
        name: "tiny.en",
        path: path.join(dataDir, "models", "ggml-tiny.en.bin"),
        sizeBytes: 24,
      },
      downloaded: true,
      warmupMs: expect.any(Number),
    });
    expect(calls.map((call) => basename(call.command))).toEqual([
      "ffmpeg",
      "whisper-cli",
    ]);
    expect(calls[0]?.args).toEqual(
      expect.arrayContaining(["-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono"]),
    );

    const second = await harness.experimental_call("prepareModel", {
      model: "tiny.en",
    });
    expect(second.downloaded).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
    await expect(readdir(path.join(dataDir, "models"))).resolves.toEqual([
      "ggml-tiny.en.bin",
    ]);
    await harness.experimental_dispose();
  });

  it("fails a download on an HTTP error and leaves no partial file", async () => {
    await installTool("ffmpeg");
    await installTool("whisper-cli");
    const { spawn } = createSpawn((_call, child) => child.succeed());
    const harness = harnessFor(
      spawn,
      async () => new Response("not found", { status: 404 }),
    );

    await expect(
      harness.experimental_call("prepareModel", { model: "nope" }),
    ).rejects.toThrow(/HTTP 404/);
    await expect(readdir(path.join(dataDir, "models"))).resolves.toEqual([]);
    await harness.experimental_dispose();
  });
});
