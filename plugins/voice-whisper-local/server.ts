import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  WHISPER_SERVICE_ID,
  whisperHostContract,
  whisperModelNameSchema,
  type PrepareModelOutput,
  type WhisperStatus,
} from "./contract.js";

const CLI_NAME = "whisper";
const USAGE = `Usage: bb ${CLI_NAME} <status|prepare <model>> [--host <id-or-name>] [--json]`;
const PREPARE_TIMEOUT_MS = 30 * 60_000;
const STATUS_TIMEOUT_MS = 30_000;
const MEGABYTE = 1024 * 1024;
const RECOMMENDED_MODEL = "base.en";

interface ParsedArgv {
  readonly command: string | null;
  readonly positionals: string[];
  readonly json: boolean;
  readonly host: string | null;
  readonly error: string | null;
}

interface TargetHost {
  readonly id: string;
  readonly name: string;
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function parseArgv(argv: string[]): ParsedArgv {
  const positionals: string[] = [];
  let json = false;
  let host: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--host") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return {
          command: null,
          positionals,
          json,
          host,
          error: "--host requires a machine id or name",
        };
      }
      host = value;
      index += 1;
    } else if (arg !== undefined && arg.startsWith("--")) {
      return {
        command: null,
        positionals,
        json,
        host,
        error: `Unknown flag ${arg}`,
      };
    } else if (arg !== undefined) {
      positionals.push(arg);
    }
  }
  const [command = null, ...rest] = positionals;
  return { command, positionals: rest, json, host, error: null };
}

function formatMegabytes(bytes: number): string {
  return `${Math.round(bytes / MEGABYTE)} MB`;
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function transcriptionSettingHint(model: string): string {
  return `bb-app config set BB_TRANSCRIPTION ${WHISPER_SERVICE_ID}/${model}`;
}

function formatStatus(args: {
  host: TargetHost;
  status: WhisperStatus;
  transcription: string;
}): string {
  const { status } = args;
  const lines = [
    `Host: ${args.host.name} (${args.host.id})`,
    `whisper-cli: ${status.whisperCli ?? "not found (brew install whisper.cpp)"}`,
    `ffmpeg: ${status.ffmpeg ?? "not found (brew install ffmpeg)"}`,
    `Model directory: ${status.modelDir}`,
  ];
  if (status.models.length === 0) {
    lines.push(
      `Models: none downloaded. Run: bb ${CLI_NAME} prepare ${RECOMMENDED_MODEL}`,
    );
  } else {
    lines.push("Models:");
    for (const model of status.models) {
      lines.push(`  ${model.name} (${formatMegabytes(model.sizeBytes)})`);
    }
  }
  lines.push(`BB_TRANSCRIPTION: ${args.transcription}`);
  if (!args.transcription.startsWith(`${WHISPER_SERVICE_ID}/`)) {
    const model = status.models[0]?.name ?? RECOMMENDED_MODEL;
    lines.push(
      `Voice input does not use whisper yet. Run: ${transcriptionSettingHint(model)}`,
    );
  }
  return lines.join("\n");
}

function formatPrepared(args: {
  host: TargetHost;
  result: PrepareModelOutput;
  transcription: string;
}): string {
  const { model } = args.result;
  const lines = [
    `${args.result.downloaded ? "Downloaded" : "Found"} ${model.name} (${formatMegabytes(model.sizeBytes)}) at ${model.path} on ${args.host.name}`,
    `Warm-up transcription took ${formatSeconds(args.result.warmupMs)}`,
  ];
  const expected = `${WHISPER_SERVICE_ID}/${model.name}`;
  if (args.transcription !== expected) {
    lines.push(
      `To use it for voice input, run: ${transcriptionSettingHint(model.name)}`,
    );
  }
  return lines.join("\n");
}

export default function plugin(bb: BbPluginApi): void {
  bb.experimental_aiServices.register({
    id: WHISPER_SERVICE_ID,
    displayName: "Local whisper.cpp",
    kinds: ["voice"],
  });

  const host = bb.hosts.experimental_client({ contract: whisperHostContract });

  async function resolveTargetHost(
    selector: string | null,
    primaryHostId: string | null,
  ): Promise<TargetHost> {
    const hosts = await bb.sdk.hosts.list();
    if (selector !== null) {
      const match = hosts.find(
        (candidate) => candidate.id === selector || candidate.name === selector,
      );
      if (match === undefined) {
        throw new CliUsageError(`No machine matches "${selector}"`);
      }
      return { id: match.id, name: match.name };
    }
    const primary = hosts.find((candidate) => candidate.id === primaryHostId);
    if (primary !== undefined) {
      return { id: primary.id, name: primary.name };
    }
    const connected = hosts.filter(
      (candidate) => candidate.status === "connected",
    );
    const only = connected[0];
    if (connected.length === 1 && only !== undefined) {
      return { id: only.id, name: only.name };
    }
    throw new CliUsageError(
      connected.length === 0
        ? "No connected machine. Start the local host daemon or pass --host"
        : `Several machines are connected; pass --host with one of: ${connected.map((candidate) => candidate.name).join(", ")}`,
    );
  }

  bb.cli.register({
    name: CLI_NAME,
    summary: "Local voice transcription with whisper.cpp",
    commands: [
      {
        name: "status",
        summary:
          "Show whisper-cli, ffmpeg, and downloaded models on the transcription host",
        usage: `bb ${CLI_NAME} status [--host <id-or-name>] [--json]`,
      },
      {
        name: "prepare",
        summary:
          "Download a whisper model onto the host and warm it up for first use",
        usage: `bb ${CLI_NAME} prepare <model> [--host <id-or-name>] [--json]`,
      },
    ],
    async run(argv, ctx) {
      const parsed = parseArgv(argv);
      if (parsed.error !== null) {
        return { exitCode: 1, stderr: `${parsed.error}\n${USAGE}` };
      }
      try {
        const config = await bb.sdk.system.config();
        const target = await resolveTargetHost(
          parsed.host,
          config.primaryHostId,
        );
        const transcription = config.aiServices.transcription;
        if (parsed.command === "status" && parsed.positionals.length === 0) {
          const result = await host.call("status", null, {
            hostId: target.id,
            timeoutMs: STATUS_TIMEOUT_MS,
            ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
          });
          return {
            exitCode: 0,
            stdout: parsed.json
              ? JSON.stringify({ host: target, transcription, ...result })
              : formatStatus({ host: target, status: result, transcription }),
          };
        }
        if (parsed.command === "prepare" && parsed.positionals.length === 1) {
          const model = whisperModelNameSchema.safeParse(parsed.positionals[0]);
          if (!model.success) {
            throw new CliUsageError(
              model.error.issues[0]?.message ?? "Invalid model name",
            );
          }
          const result = await host.call(
            "prepareModel",
            { model: model.data },
            {
              hostId: target.id,
              timeoutMs: PREPARE_TIMEOUT_MS,
              ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
            },
          );
          return {
            exitCode: 0,
            stdout: parsed.json
              ? JSON.stringify({ host: target, transcription, ...result })
              : formatPrepared({ host: target, result, transcription }),
          };
        }
        return { exitCode: 1, stderr: USAGE };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          exitCode: 1,
          stderr:
            error instanceof CliUsageError ? `${message}\n${USAGE}` : message,
        };
      }
    },
  });
}
