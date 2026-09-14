import { isAbsolute, resolve } from "node:path";
import type { BbPluginApi, PluginCliResult } from "@get-bb/plugin-sdk";
import { looksLikeSessionPath } from "./session-import.js";
import {
  SessionImportError,
  type ClaudeSessionImportService,
} from "./session-import-service.js";

const IMPORT_USAGE =
  "Usage: bb claude-code import <session-id|title|session.jsonl> [--project <id>] [--environment <id|path>] [--machine <host-id>] [--title <text>] [--turns A-B] [--json]";
const SESSIONS_USAGE =
  "Usage: bb claude-code sessions [--dir <path>] [--machine <host-id>] [--limit <n>] [--json]";
const USAGE = `${IMPORT_USAGE}\n${SESSIONS_USAGE}`;
const DEFAULT_SESSION_LIST_LIMIT = 30;

interface ParsedImportArgs {
  session: string;
  projectId: string | null;
  environment: string | null;
  machine: string | null;
  title: string | null;
  turns: { from: number; to: number } | null;
  json: boolean;
}

function fail(message: string): PluginCliResult {
  return { exitCode: 1, stderr: message };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseImportArgs(argv: readonly string[]): ParsedImportArgs | string {
  const parsed: ParsedImportArgs = {
    session: "",
    projectId: null,
    environment: null,
    machine: null,
    title: null,
    turns: null,
    json: false,
  };
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const readValue = (): string | null => {
      const value = argv[index + 1];
      if (value === undefined) return null;
      index += 1;
      return value;
    };
    switch (arg) {
      case "--json":
        parsed.json = true;
        break;
      case "--project":
        parsed.projectId = readValue();
        if (parsed.projectId === null) return "--project needs a project id";
        break;
      case "--environment":
        parsed.environment = readValue();
        if (parsed.environment === null) {
          return "--environment needs an environment id or a workspace path";
        }
        break;
      case "--machine":
        parsed.machine = readValue();
        if (parsed.machine === null) return "--machine needs a host id";
        break;
      case "--title":
        parsed.title = readValue();
        if (parsed.title === null) return "--title needs a value";
        break;
      case "--turns": {
        const value = readValue();
        const match = value === null ? null : /^(\d+)-(\d+)$/u.exec(value);
        if (match === null) return "--turns expects A-B, for example 3-7";
        parsed.turns = { from: Number(match[1]), to: Number(match[2]) };
        if (parsed.turns.from < 1 || parsed.turns.to < parsed.turns.from) {
          return "--turns expects 1 <= A <= B";
        }
        break;
      }
      default:
        if (arg.startsWith("--")) return `Unknown flag ${arg}\n${IMPORT_USAGE}`;
        positional.push(arg);
    }
  }
  if (positional.length !== 1) return IMPORT_USAGE;
  parsed.session = positional[0] ?? "";
  return parsed;
}

interface ParsedSessionsArgs {
  dir: string | null;
  machine: string | null;
  limit: number;
  json: boolean;
}

function parseSessionsArgs(
  argv: readonly string[],
): ParsedSessionsArgs | string {
  const parsed: ParsedSessionsArgs = {
    dir: null,
    machine: null,
    limit: DEFAULT_SESSION_LIST_LIMIT,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    const value = argv[index + 1];
    switch (arg) {
      case "--json":
        parsed.json = true;
        break;
      case "--dir":
        if (value === undefined) return "--dir needs a directory path";
        parsed.dir = value;
        index += 1;
        break;
      case "--machine":
        if (value === undefined) return "--machine needs a host id";
        parsed.machine = value;
        index += 1;
        break;
      case "--limit": {
        const limit = value === undefined ? Number.NaN : Number(value);
        if (!Number.isInteger(limit) || limit < 1) return "--limit needs a positive integer";
        parsed.limit = limit;
        index += 1;
        break;
      }
      default:
        return `Unknown argument ${arg}\n${SESSIONS_USAGE}`;
    }
  }
  return parsed;
}

function formatAge(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function failFrom(error: unknown): PluginCliResult {
  return fail(
    error instanceof SessionImportError ? error.message : errorMessage(error),
  );
}

export function registerClaudeSessionImportCli(
  bb: BbPluginApi,
  service: ClaudeSessionImportService,
): void {
  async function runSessions(
    argv: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<PluginCliResult> {
    const parsed = parseSessionsArgs(argv);
    if (typeof parsed === "string") return fail(parsed);
    let listing;
    try {
      listing = await service.listSessions({
        machine: parsed.machine,
        dir: parsed.dir,
        signal,
      });
    } catch (error) {
      return failFrom(error);
    }
    const { machine, sessions } = listing;
    const shown = sessions.slice(0, parsed.limit);
    if (parsed.json) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          machine: machine.id,
          total: sessions.length,
          sessions: shown,
        }),
      };
    }
    if (shown.length === 0) {
      return {
        exitCode: 0,
        stdout: `No Claude Code sessions on ${machine.name}${parsed.dir === null ? "" : ` for ${parsed.dir}`}.`,
      };
    }
    const now = Date.now();
    const lines = shown.map((session) => {
      const label = session.title ?? session.firstPrompt ?? "(untitled)";
      const project =
        session.projectName === null ? "" : `  [${session.projectName}]`;
      return `${session.sessionId}  ${formatAge(session.lastActivityAt, now).padEnd(8)}  ${String(session.turnCount).padStart(3)} turns  ${session.cwd ?? "?"}${project}\n    ${label.replace(/\s+/gu, " ").slice(0, 110)}`;
    });
    const footer =
      sessions.length > shown.length
        ? `\n${sessions.length - shown.length} more; raise --limit or narrow with --dir <path>.`
        : "";
    return {
      exitCode: 0,
      stdout: `${lines.join("\n")}${footer}\nImport one with: bb claude-code import <id|title>`,
    };
  }

  bb.cli.register({
    name: "claude-code",
    summary: "List and import Claude Code sessions into bb threads",
    commands: [
      {
        name: "sessions",
        summary:
          "List Claude Code sessions on a machine (id, title, directory, last activity) so one can be imported",
        usage: SESSIONS_USAGE,
      },
      {
        name: "import",
        summary:
          "Create a bb thread from an existing Claude Code session by id, title, or transcript path; its next message continues that conversation",
        usage: IMPORT_USAGE,
      },
    ],
    async run(argv, ctx) {
      const [command, ...rest] = argv;
      if (command === "sessions") return runSessions(rest, ctx.signal);
      if (command !== "import") return fail(USAGE);
      const parsed = parseImportArgs(rest);
      if (typeof parsed === "string") return fail(parsed);
      if (looksLikeSessionPath(parsed.session) && !isAbsolute(parsed.session)) {
        if (ctx.cwd === undefined) {
          return fail(
            "Pass the session transcript as an absolute path, or use its session id",
          );
        }
        parsed.session = resolve(ctx.cwd, parsed.session);
      }

      let result;
      try {
        result = await service.importSession({
          session: parsed.session,
          machine: parsed.machine,
          projectId: parsed.projectId,
          environment: parsed.environment,
          title: parsed.title,
          turns: parsed.turns,
          fallbackProjectId: ctx.projectId,
          signal: ctx.signal,
        });
      } catch (error) {
        return failFrom(error);
      }
      const { thread, session } = result;

      if (parsed.json) {
        return { exitCode: 0, stdout: JSON.stringify({ thread, session }) };
      }
      return {
        exitCode: 0,
        stdout: [
          `Imported Claude Code session ${session.id} (turns ${session.importedTurns.from}-${session.importedTurns.to} of ${session.turnCount}) into thread ${thread.id}.`,
          `The next message you send forks that session and continues it; open it with \`bb thread open ${thread.id}\`.`,
        ].join("\n"),
      };
    },
  });
}
