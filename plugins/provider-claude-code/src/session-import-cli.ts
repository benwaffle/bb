import { isAbsolute, resolve } from "node:path";
import type { BbPluginApi, PluginCliResult } from "@get-bb/plugin-sdk";
import { looksLikeSessionPath } from "./session-import.js";
import { claudeSessionImportHostContract } from "./session-import-contract.js";

type ImportArgs = Parameters<
  BbPluginApi["sdk"]["threads"]["experimental_import"]
>[0];
type ImportedTurns = ImportArgs["turns"];
type ImportedEvent = ImportedTurns[number]["events"][number]["event"];
type ImportEnvironment = ImportArgs["environment"];

const IMPORT_USAGE =
  "Usage: bb claude-code import <session-id|title|session.jsonl> [--project <id>] [--environment <id|path>] [--machine <host-id>] [--title <text>] [--turns A-B] [--json]";
const SESSIONS_USAGE =
  "Usage: bb claude-code sessions [--dir <path>] [--machine <host-id>] [--limit <n>] [--json]";
const USAGE = `${IMPORT_USAGE}\n${SESSIONS_USAGE}`;
const DEFAULT_SESSION_LIST_LIMIT = 30;
const INITIAL_TURN_BATCH = 8;
const HOST_CALL_TIMEOUT_MS = 5 * 60 * 1000;

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

function isResultTooLargeError(error: unknown): boolean {
  return /exceeds .* bytes/u.test(errorMessage(error));
}

export function registerClaudeSessionImportCli(bb: BbPluginApi): void {
  const host = bb.hosts.experimental_client({
    contract: claudeSessionImportHostContract,
  });

  async function selectHost(
    machine: string | null,
    signal: AbortSignal | undefined,
  ): Promise<{ id: string; name: string } | string> {
    const hosts = await bb.sdk.hosts.list(signal ? { signal } : undefined);
    if (machine !== null) {
      const selected = hosts.find(
        (candidate) => candidate.id === machine || candidate.name === machine,
      );
      if (selected === undefined) return `No machine "${machine}"`;
      if (selected.status !== "connected") {
        return `Machine ${selected.name} (${selected.id}) is not connected`;
      }
      return selected;
    }
    const connected = hosts.filter((candidate) => candidate.status === "connected");
    if (connected.length === 1 && connected[0] !== undefined) {
      return connected[0];
    }
    if (connected.length === 0) return "No connected machine can read Claude Code sessions";
    return `Several machines are connected; pick the one holding the session with --machine:\n${connected
      .map((candidate) => `  ${candidate.id}  ${candidate.name}`)
      .join("\n")}`;
  }

  async function readAllTurns(args: {
    hostId: string;
    session: string;
    range: { from: number; to: number } | null;
    signal: AbortSignal | undefined;
  }) {
    const first = await host.call(
      "readClaudeSessionTurns",
      {
        session: args.session,
        turns: { from: args.range?.from ?? 1, to: args.range?.from ?? 1 },
        entropyPrefix: "imp0",
      },
      { hostId: args.hostId, timeoutMs: HOST_CALL_TIMEOUT_MS, ...(args.signal ? { signal: args.signal } : {}) },
    );
    const from = args.range?.from ?? 1;
    const to = Math.min(args.range?.to ?? first.turnCount, first.turnCount);
    const importedTurns = [...first.importedTurns];
    let next = from + 1;
    let batch = INITIAL_TURN_BATCH;
    let page = 1;
    while (next <= to) {
      const end = Math.min(next + batch - 1, to);
      try {
        const result = await host.call(
          "readClaudeSessionTurns",
          {
            session: args.session,
            turns: { from: next, to: end },
            entropyPrefix: `imp${page}`,
          },
          { hostId: args.hostId, timeoutMs: HOST_CALL_TIMEOUT_MS, ...(args.signal ? { signal: args.signal } : {}) },
        );
        importedTurns.push(...result.importedTurns);
        next = end + 1;
        page += 1;
      } catch (error) {
        if (!isResultTooLargeError(error) || batch === 1) throw error;
        batch = Math.max(1, Math.floor(batch / 2));
      }
    }
    return { ...first, importedTurns, turns: { from, to } };
  }

  async function resolveProjectId(args: {
    cwd: string | null;
    hostId: string;
    requested: string | null;
    fallback: string | undefined;
    signal: AbortSignal | undefined;
  }): Promise<string | null> {
    if (args.requested !== null) return args.requested;
    if (args.cwd !== null) {
      const projects = await bb.sdk.projects.list(
        args.signal ? { signal: args.signal } : undefined,
      );
      const match = projects.find((project) =>
        project.sources.some(
          (source) =>
            source.type === "local_path" &&
            source.hostId === args.hostId &&
            source.path === args.cwd,
        ),
      );
      if (match !== undefined) return match.id;
    }
    return args.fallback ?? null;
  }

  async function resolveEnvironment(args: {
    cwd: string | null;
    hostId: string;
    projectId: string;
    requested: string | null;
    signal: AbortSignal | undefined;
  }): Promise<ImportEnvironment | string> {
    if (args.requested !== null) {
      if (args.requested.includes("/")) {
        return {
          type: "host",
          hostId: args.hostId,
          workspace: { type: "unmanaged", path: args.requested },
        };
      }
      return { type: "reuse", environmentId: args.requested };
    }
    if (args.cwd === null) {
      return "The session records no working directory; pass --environment <id|path>";
    }
    const environments = await bb.sdk.environments.list({
      hostId: args.hostId,
      path: args.cwd,
      projectId: args.projectId,
      ...(args.signal ? { signal: args.signal } : {}),
    });
    const ready = environments.find(
      (environment) =>
        environment.status === "ready" && environment.path === args.cwd,
    );
    if (ready !== undefined) {
      return { type: "reuse", environmentId: ready.id };
    }
    return {
      type: "host",
      hostId: args.hostId,
      workspace: { type: "unmanaged", path: args.cwd },
    };
  }

  async function runSessions(
    argv: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<PluginCliResult> {
    const parsed = parseSessionsArgs(argv);
    if (typeof parsed === "string") return fail(parsed);
    const selectedHost = await selectHost(parsed.machine, signal);
    if (typeof selectedHost === "string") return fail(selectedHost);
    let sessions;
    try {
      ({ sessions } = await host.call(
        "listClaudeSessions",
        parsed.dir === null ? {} : { dir: parsed.dir },
        {
          hostId: selectedHost.id,
          timeoutMs: HOST_CALL_TIMEOUT_MS,
          ...(signal ? { signal } : {}),
        },
      ));
    } catch (error) {
      return fail(errorMessage(error));
    }
    const shown = sessions.slice(0, parsed.limit);
    if (parsed.json) {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          machine: selectedHost.id,
          total: sessions.length,
          sessions: shown,
        }),
      };
    }
    if (shown.length === 0) {
      return {
        exitCode: 0,
        stdout: `No Claude Code sessions on ${selectedHost.name}${parsed.dir === null ? "" : ` for ${parsed.dir}`}.`,
      };
    }
    const now = Date.now();
    const lines = shown.map((session) => {
      const label = session.title ?? session.firstPrompt ?? "(untitled)";
      return `${session.sessionId}  ${formatAge(session.lastActivityAt, now).padEnd(8)}  ${String(session.turnCount).padStart(3)} turns  ${session.cwd ?? "?"}\n    ${label.replace(/\s+/gu, " ").slice(0, 110)}`;
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
      const signal = ctx.signal;
      if (looksLikeSessionPath(parsed.session) && !isAbsolute(parsed.session)) {
        if (ctx.cwd === undefined) {
          return fail(
            "Pass the session transcript as an absolute path, or use its session id",
          );
        }
        parsed.session = resolve(ctx.cwd, parsed.session);
      }

      const selectedHost = await selectHost(parsed.machine, signal);
      if (typeof selectedHost === "string") return fail(selectedHost);

      let session;
      try {
        session = await readAllTurns({
          hostId: selectedHost.id,
          session: parsed.session,
          range: parsed.turns,
          signal,
        });
      } catch (error) {
        return fail(errorMessage(error));
      }
      if (session.importedTurns.length === 0) {
        return fail(
          `Session ${session.sessionId} has no prompts to import in turns ${session.turns.from}-${session.turns.to}`,
        );
      }

      const projectId = await resolveProjectId({
        cwd: session.cwd,
        hostId: selectedHost.id,
        requested: parsed.projectId,
        fallback: ctx.projectId,
        signal,
      });
      if (projectId === null) {
        return fail(
          `No bb project has ${session.cwd ?? "the session's directory"} as a source on ${selectedHost.name}; pass --project <id>`,
        );
      }
      const environment = await resolveEnvironment({
        cwd: session.cwd,
        hostId: selectedHost.id,
        projectId,
        requested: parsed.environment,
        signal,
      });
      if (typeof environment === "string") return fail(environment);

      const turns: ImportedTurns = session.importedTurns.map((turn) => ({
        at: turn.at,
        input: turn.input as ImportedTurns[number]["input"],
        events: turn.events.map((entry) => ({
          at: entry.at,
          event: entry.event as ImportedEvent,
        })),
      }));
      const title = parsed.title ?? session.title ?? undefined;
      let thread;
      try {
        thread = await bb.sdk.threads.experimental_import({
          projectId,
          providerId: "claude-code",
          environment,
          sourceProviderThreadId: session.sessionId,
          turns,
          ...(title === undefined ? {} : { title }),
          ...(session.model === null ? {} : { model: session.model }),
        });
      } catch (error) {
        return fail(errorMessage(error));
      }

      if (parsed.json) {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            thread,
            session: {
              id: session.sessionId,
              path: session.sessionPath,
              cwd: session.cwd,
              turnCount: session.turnCount,
              importedTurns: session.turns,
            },
          }),
        };
      }
      return {
        exitCode: 0,
        stdout: [
          `Imported Claude Code session ${session.sessionId} (turns ${session.turns.from}-${session.turns.to} of ${session.turnCount}) into thread ${thread.id}.`,
          `The next message you send forks that session and continues it; open it with \`bb thread open ${thread.id}\`.`,
        ].join("\n"),
      };
    },
  });
}
