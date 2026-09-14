import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type {
  ExperimentalAiInferenceCompleteOutput,
  ExperimentalAiServiceErrorCode,
  ExperimentalAiVoiceTranscribeInput,
  ExperimentalAiVoiceTranscribeOutput,
} from "@get-bb/plugin-sdk/ai-services";
import {
  experimental_defineHostEntry,
  type ExperimentalHostPaths,
} from "@get-bb/plugin-sdk/host";
import {
  WHISPER_SERVICE_ID,
  whisperHostContract,
  type InstalledModel,
  type PrepareModelOutput,
  type WhisperStatus,
} from "./contract.js";

const WHISPER_CLI_NAME = "whisper-cli";
const FFMPEG_NAME = "ffmpeg";
const FALLBACK_BIN_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/home/linuxbrew/.linuxbrew/bin",
];
const MODEL_DIR_NAME = "models";
const MODEL_FILE_PREFIX = "ggml-";
const MODEL_FILE_SUFFIX = ".bin";
const MODEL_DOWNLOAD_BASE_URL =
  "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/";
const WHISPER_SAMPLE_RATE = "16000";
const WARMUP_TIMEOUT_MS = 5 * 60_000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60_000;
const STDERR_TAIL_CHARS = 400;
const INSTALL_HINT =
  "Install whisper.cpp and ffmpeg on this host (brew install whisper.cpp ffmpeg), then retry.";

const AUDIO_EXTENSIONS: Record<string, string> = {
  "audio/webm": ".webm",
  "video/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/mpeg": ".mp3",
  "audio/flac": ".flac",
};

interface CommandRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

interface CommandResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly aborted: boolean;
}

export interface SpawnedProcess {
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  kill(signal: NodeJS.Signals): boolean;
  once(event: "error", listener: (error: Error) => void): this;
  once(event: "close", listener: (code: number | null) => void): this;
}

export interface WhisperHostDependencies {
  readonly env: NodeJS.ProcessEnv;
  readonly fallbackBinDirs: readonly string[];
  spawn(command: string, args: readonly string[]): SpawnedProcess;
  fetch(url: string, init: { signal: AbortSignal }): Promise<Response>;
}

export interface ResolvedTools {
  readonly whisperCli: string | null;
  readonly ffmpeg: string | null;
}

class WhisperFailure extends Error {
  readonly code: ExperimentalAiServiceErrorCode;

  constructor(code: ExperimentalAiServiceErrorCode, message: string) {
    super(message);
    this.name = "WhisperFailure";
    this.code = code;
  }
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.X_OK);
    const info = await stat(filePath);
    return info.isFile();
  } catch {
    return false;
  }
}

async function fileSize(filePath: string): Promise<number | null> {
  try {
    const info = await stat(filePath);
    return info.isFile() ? info.size : null;
  } catch {
    return null;
  }
}

type ToolLookup = Pick<WhisperHostDependencies, "env" | "fallbackBinDirs">;

function searchDirectories(lookup: ToolLookup): string[] {
  const fromPath = (lookup.env.PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry.length > 0);
  return [...new Set([...fromPath, ...lookup.fallbackBinDirs])];
}

async function findExecutable(
  lookup: ToolLookup,
  name: string,
): Promise<string | null> {
  for (const directory of searchDirectories(lookup)) {
    const candidate = path.join(directory, name);
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function resolveTools(lookup: ToolLookup): Promise<ResolvedTools> {
  const [whisperCli, ffmpeg] = await Promise.all([
    findExecutable(lookup, WHISPER_CLI_NAME),
    findExecutable(lookup, FFMPEG_NAME),
  ]);
  return { whisperCli, ffmpeg };
}

function modelDirectory(paths: ExperimentalHostPaths): string {
  return path.join(paths.dataDir, MODEL_DIR_NAME);
}

function modelFileName(model: string): string {
  return `${MODEL_FILE_PREFIX}${model}${MODEL_FILE_SUFFIX}`;
}

function modelFilePath(paths: ExperimentalHostPaths, model: string): string {
  return path.join(modelDirectory(paths), modelFileName(model));
}

function modelNameFromFileName(fileName: string): string | null {
  if (
    !fileName.startsWith(MODEL_FILE_PREFIX) ||
    !fileName.endsWith(MODEL_FILE_SUFFIX)
  ) {
    return null;
  }
  const name = fileName.slice(
    MODEL_FILE_PREFIX.length,
    fileName.length - MODEL_FILE_SUFFIX.length,
  );
  return name.length > 0 ? name : null;
}

function isEnglishOnlyModel(model: string): boolean {
  return model.endsWith(".en");
}

function collectStream(stream: NodeJS.ReadableStream | null): Promise<string> {
  if (stream === null) return Promise.resolve("");
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    const settle = (): void => resolve(Buffer.concat(chunks).toString("utf8"));
    stream.once("end", settle);
    stream.once("close", settle);
    stream.once("error", settle);
  });
}

function runCommand(
  deps: WhisperHostDependencies,
  request: CommandRequest,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    let child: SpawnedProcess;
    try {
      child = deps.spawn(request.command, request.args);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let timedOut = false;
    let aborted = false;
    let settled = false;
    const stdout = collectStream(child.stdout);
    const stderr = collectStream(child.stderr);
    const kill = (): void => {
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, request.timeoutMs);
    timer.unref();
    const onAbort = (): void => {
      aborted = true;
      kill();
    };
    request.signal?.addEventListener("abort", onAbort, { once: true });
    const finish = (
      outcome: { exitCode: number | null } | { error: Error },
    ): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.signal?.removeEventListener("abort", onAbort);
      void Promise.all([stdout, stderr]).then(([out, err]) => {
        if ("error" in outcome) {
          reject(outcome.error);
          return;
        }
        resolve({
          exitCode: outcome.exitCode,
          stdout: out,
          stderr: err,
          timedOut,
          aborted,
        });
      });
    };
    child.once("error", (error) => finish({ error }));
    child.once("close", (code) => finish({ exitCode: code }));
  });
}

function assertNotCancelled(result: CommandResult): void {
  if (result.aborted) {
    throw new WhisperFailure("request_failed", "Transcription was cancelled");
  }
}

async function hasModelFile(modelPath: string): Promise<boolean> {
  const size = await fileSize(modelPath);
  return size !== null && size > 0;
}

function stderrTail(stderr: string): string {
  const trimmed = stderr.trim();
  return trimmed.length > STDERR_TAIL_CHARS
    ? trimmed.slice(trimmed.length - STDERR_TAIL_CHARS)
    : trimmed;
}

function describeFailure(label: string, result: CommandResult): string {
  const detail = stderrTail(result.stderr);
  const exit =
    result.exitCode === null ? "was killed" : `exited with ${result.exitCode}`;
  return detail.length > 0 ? `${label} ${exit}: ${detail}` : `${label} ${exit}`;
}

function audioExtension(input: ExperimentalAiVoiceTranscribeInput): string {
  const fromName = path.extname(input.filename);
  if (fromName.length > 1 && fromName.length <= 8) {
    return fromName.toLowerCase();
  }
  const mimeType = input.mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  return AUDIO_EXTENSIONS[mimeType] ?? ".bin";
}

function normalizeTranscript(stdout: string): string {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function ffmpegToWavArgs(inputPath: string, wavPath: string): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ar",
    WHISPER_SAMPLE_RATE,
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ];
}

function ffmpegSilenceArgs(wavPath: string): string[] {
  return [
    "-nostdin",
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `anullsrc=r=${WHISPER_SAMPLE_RATE}:cl=mono`,
    "-t",
    "1",
    "-c:a",
    "pcm_s16le",
    wavPath,
  ];
}

export function whisperCliArgs(args: {
  modelPath: string;
  wavPath: string;
  model: string;
  prompt: string | null;
}): string[] {
  const cliArgs = [
    "-m",
    args.modelPath,
    "-f",
    args.wavPath,
    "--no-timestamps",
    "--no-prints",
  ];
  if (!isEnglishOnlyModel(args.model)) {
    cliArgs.push("--language", "auto");
  }
  if (args.prompt !== null && args.prompt.length > 0) {
    cliArgs.push("--prompt", args.prompt);
  }
  return cliArgs;
}

class Deadline {
  private readonly endsAt: number;

  constructor(timeoutMs: number) {
    this.endsAt = Date.now() + timeoutMs;
  }

  remainingMs(): number {
    return Math.max(1, this.endsAt - Date.now());
  }
}

async function requireTools(lookup: ToolLookup): Promise<{
  whisperCli: string;
  ffmpeg: string;
}> {
  const tools = await resolveTools(lookup);
  if (tools.whisperCli === null) {
    throw new WhisperFailure(
      "request_failed",
      `${WHISPER_CLI_NAME} was not found on this host. ${INSTALL_HINT}`,
    );
  }
  if (tools.ffmpeg === null) {
    throw new WhisperFailure(
      "request_failed",
      `${FFMPEG_NAME} was not found on this host. ${INSTALL_HINT}`,
    );
  }
  return { whisperCli: tools.whisperCli, ffmpeg: tools.ffmpeg };
}

async function requireModel(
  paths: ExperimentalHostPaths,
  model: string,
): Promise<string> {
  const modelPath = modelFilePath(paths, model);
  if (!(await hasModelFile(modelPath))) {
    throw new WhisperFailure(
      "request_failed",
      `Whisper model "${model}" is not downloaded on this host. Run: bb whisper prepare ${model}`,
    );
  }
  return modelPath;
}

async function transcribe(
  deps: WhisperHostDependencies,
  paths: ExperimentalHostPaths,
  input: ExperimentalAiVoiceTranscribeInput,
  signal: AbortSignal,
): Promise<Extract<ExperimentalAiVoiceTranscribeOutput, { ok: true }>> {
  const deadline = new Deadline(input.timeoutMs);
  const tools = await requireTools(deps);
  const modelPath = await requireModel(paths, input.model);
  await mkdir(paths.tempDir, { recursive: true });
  const workDir = await mkdtemp(path.join(paths.tempDir, "transcribe-"));
  try {
    const inputPath = path.join(workDir, `input${audioExtension(input)}`);
    const wavPath = path.join(workDir, "input.wav");
    await writeFile(inputPath, Buffer.from(input.audioBase64, "base64"));

    const converted = await runCommand(deps, {
      command: tools.ffmpeg,
      args: ffmpegToWavArgs(inputPath, wavPath),
      timeoutMs: deadline.remainingMs(),
      signal,
    });
    assertNotCancelled(converted);
    if (converted.timedOut) {
      throw new WhisperFailure("timeout", "Audio conversion timed out");
    }
    if (converted.exitCode !== 0) {
      throw new WhisperFailure(
        "request_failed",
        describeFailure("ffmpeg", converted),
      );
    }

    const recognized = await runCommand(deps, {
      command: tools.whisperCli,
      args: whisperCliArgs({
        modelPath,
        wavPath,
        model: input.model,
        prompt: input.prompt,
      }),
      timeoutMs: deadline.remainingMs(),
      signal,
    });
    assertNotCancelled(recognized);
    if (recognized.timedOut) {
      throw new WhisperFailure(
        "timeout",
        `${WHISPER_CLI_NAME} did not finish within ${input.timeoutMs}ms`,
      );
    }
    if (recognized.exitCode !== 0) {
      throw new WhisperFailure(
        "request_failed",
        describeFailure(WHISPER_CLI_NAME, recognized),
      );
    }
    return {
      ok: true,
      model: input.model,
      text: normalizeTranscript(recognized.stdout),
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

function toFailure(error: unknown): {
  ok: false;
  code: ExperimentalAiServiceErrorCode;
  message: string;
} {
  if (error instanceof WhisperFailure) {
    return { ok: false, code: error.code, message: error.message };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, code: "request_failed", message };
}

async function listInstalledModels(
  paths: ExperimentalHostPaths,
): Promise<InstalledModel[]> {
  const directory = modelDirectory(paths);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return [];
  }
  const models: InstalledModel[] = [];
  for (const entry of entries.sort()) {
    const name = modelNameFromFileName(entry);
    if (name === null) continue;
    const filePath = path.join(directory, entry);
    const sizeBytes = await fileSize(filePath);
    if (sizeBytes === null) continue;
    models.push({ name, path: filePath, sizeBytes });
  }
  return models;
}

async function status(
  deps: WhisperHostDependencies,
  paths: ExperimentalHostPaths,
): Promise<WhisperStatus> {
  const [tools, models] = await Promise.all([
    resolveTools(deps),
    listInstalledModels(paths),
  ]);
  return {
    whisperCli: tools.whisperCli,
    ffmpeg: tools.ffmpeg,
    modelDir: modelDirectory(paths),
    models,
  };
}

async function downloadModel(
  deps: WhisperHostDependencies,
  modelPath: string,
  model: string,
  signal: AbortSignal,
): Promise<void> {
  const url = `${MODEL_DOWNLOAD_BASE_URL}${modelFileName(model)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  timer.unref();
  const onAbort = (): void => controller.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const partialPath = `${modelPath}.part`;
  try {
    await mkdir(path.dirname(modelPath), { recursive: true });
    const response = await deps.fetch(url, { signal: controller.signal });
    if (!response.ok || response.body === null) {
      await response.body?.cancel();
      throw new Error(
        `Downloading ${url} failed with HTTP ${response.status}. Check the model name against https://huggingface.co/ggerganov/whisper.cpp`,
      );
    }
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
      createWriteStream(partialPath),
    );
    await rename(partialPath, modelPath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

async function warmUp(
  deps: WhisperHostDependencies,
  paths: ExperimentalHostPaths,
  modelPath: string,
  model: string,
  signal: AbortSignal,
): Promise<number> {
  const tools = await requireTools(deps);
  await mkdir(paths.tempDir, { recursive: true });
  const workDir = await mkdtemp(path.join(paths.tempDir, "warmup-"));
  try {
    const wavPath = path.join(workDir, "silence.wav");
    const silence = await runCommand(deps, {
      command: tools.ffmpeg,
      args: ffmpegSilenceArgs(wavPath),
      timeoutMs: WARMUP_TIMEOUT_MS,
      signal,
    });
    if (silence.exitCode !== 0) {
      throw new Error(describeFailure("ffmpeg", silence));
    }
    const startedAt = Date.now();
    const recognized = await runCommand(deps, {
      command: tools.whisperCli,
      args: whisperCliArgs({ modelPath, wavPath, model, prompt: null }),
      timeoutMs: WARMUP_TIMEOUT_MS,
      signal,
    });
    if (recognized.exitCode !== 0) {
      throw new Error(describeFailure(WHISPER_CLI_NAME, recognized));
    }
    return Date.now() - startedAt;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function prepareModel(
  deps: WhisperHostDependencies,
  paths: ExperimentalHostPaths,
  model: string,
  signal: AbortSignal,
): Promise<PrepareModelOutput> {
  const modelPath = modelFilePath(paths, model);
  const downloaded = !(await hasModelFile(modelPath));
  if (downloaded) {
    await downloadModel(deps, modelPath, model, signal);
  }
  const warmupMs = await warmUp(deps, paths, modelPath, model, signal);
  const sizeBytes = await fileSize(modelPath);
  if (sizeBytes === null) {
    throw new Error(`Model file ${modelPath} disappeared after download`);
  }
  return {
    model: { name: model, path: modelPath, sizeBytes },
    downloaded,
    warmupMs,
  };
}

function wrongService(serviceId: string): {
  ok: false;
  code: ExperimentalAiServiceErrorCode;
  message: string;
} {
  return {
    ok: false,
    code: "request_failed",
    message: `This plugin serves no AI service "${serviceId}".`,
  };
}

export function createWhisperHostEntry(deps: WhisperHostDependencies) {
  return experimental_defineHostEntry({
    contract: whisperHostContract,
    handlers: {
      "ai.inference.complete": (
        input,
      ): ExperimentalAiInferenceCompleteOutput => {
        if (input.serviceId !== WHISPER_SERVICE_ID) {
          return wrongService(input.serviceId);
        }
        return {
          ok: false,
          code: "request_failed",
          message: "The whisper service transcribes voice only.",
        };
      },
      "ai.voice.transcribe": async (
        input,
        context,
      ): Promise<ExperimentalAiVoiceTranscribeOutput> => {
        if (input.serviceId !== WHISPER_SERVICE_ID) {
          return wrongService(input.serviceId);
        }
        try {
          return await transcribe(
            deps,
            context.experimental_paths,
            input,
            context.signal,
          );
        } catch (error) {
          return toFailure(error);
        }
      },
      status: (_input, context) => status(deps, context.experimental_paths),
      prepareModel: (input, context) =>
        prepareModel(
          deps,
          context.experimental_paths,
          input.model,
          context.signal,
        ),
    },
  });
}

export default createWhisperHostEntry({
  env: process.env,
  fallbackBinDirs: FALLBACK_BIN_DIRS,
  spawn(command, args) {
    return spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
  },
  fetch(url, init) {
    return fetch(url, init);
  },
});
