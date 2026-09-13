import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  experimental_createDeltaAssembler as createDeltaAssembler,
  type DeltaAssembler,
  type PromptInput,
} from "@get-bb/plugin-sdk/provider-bridge";
import {
  createClaudeDeltaTranslator,
  type ClaudeDeltaTranslator,
} from "./delta-translation.js";
import {
  convertClaudeTranscript,
  isRecord,
  isRootPrompt,
  isTaskNotificationPrompt,
  sessionTitle,
  textOf,
  type ConvertedTranscriptEntry,
  type TranscriptRecord,
} from "./transcript-conversion.js";

type ThreadEvent = ReturnType<DeltaAssembler["assemble"]>[number];
type ClientTurnRequestId = Parameters<ClaudeDeltaTranslator["acceptInput"]>[1];

export interface ImportedSessionEvent {
  at: number;
  event: ThreadEvent;
}

export interface ImportedSessionTurn {
  at: number;
  input: PromptInput[];
  events: ImportedSessionEvent[];
}

export interface ImportedClaudeSession {
  sessionId: string;
  sessionPath: string;
  cwd: string | null;
  model: string | null;
  title: string | null;
  turnCount: number;
  turns: { from: number; to: number };
  importedTurns: ImportedSessionTurn[];
}

export interface ClaudeSessionSummary {
  sessionId: string;
  sessionPath: string;
  cwd: string | null;
  title: string | null;
  firstPrompt: string | null;
  lastActivityAt: number;
  turnCount: number;
}

export interface ListClaudeSessionsOptions {
  dir?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ReadClaudeSessionTurnsOptions {
  session: string;
  turns?: { from: number; to: number };
  entropyPrefix: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
}

const CLIENT_REQUEST_ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
const CLIENT_REQUEST_ID_LENGTH = 10;
const IMPORT_THREAD_ID = "claude-session-import";
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function looksLikeSessionPath(session: string): boolean {
  return session.endsWith(".jsonl") || session.includes("/");
}

export function claudeConfigDir(args: {
  homeDir: string;
  env: NodeJS.ProcessEnv;
}): string {
  const configured = args.env.CLAUDE_CONFIG_DIR;
  return configured !== undefined && configured.length > 0
    ? configured
    : join(args.homeDir, ".claude");
}

function summarizeClaudeSession(sessionPath: string): ClaudeSessionSummary | null {
  let raw: string;
  try {
    raw = readFileSync(sessionPath, "utf8");
  } catch {
    return null;
  }
  const records: TranscriptRecord[] = [];
  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) records.push(parsed);
    } catch {
      continue;
    }
  }
  const summary: ClaudeSessionSummary = {
    sessionId: sessionPath.slice(sessionPath.lastIndexOf("/") + 1, -".jsonl".length),
    sessionPath,
    cwd: null,
    title: null,
    firstPrompt: null,
    lastActivityAt: 0,
    turnCount: 0,
  };
  let sawConversation = false;
  for (const record of records) {
    if (summary.cwd === null && typeof record.cwd === "string") {
      summary.cwd = record.cwd;
    }
    if (typeof record.timestamp === "string") {
      const at = Date.parse(record.timestamp);
      if (!Number.isNaN(at) && at > summary.lastActivityAt) {
        summary.lastActivityAt = at;
      }
    }
    if (record.type === "assistant") {
      sawConversation = true;
    } else if (record.type === "user") {
      sawConversation = true;
      if (isRootPrompt(record) && !isTaskNotificationPrompt(record)) {
        summary.turnCount += 1;
        if (summary.firstPrompt === null) {
          const message = isRecord(record.message) ? record.message : null;
          const text = textOf(message?.content).trim();
          if (text.length > 0) summary.firstPrompt = text.slice(0, 200);
        }
      }
    }
  }
  if (!sawConversation) return null;
  summary.title = sessionTitle(records);
  if (summary.lastActivityAt === 0) {
    summary.lastActivityAt = statSync(sessionPath).mtimeMs;
  }
  return summary;
}

export function listClaudeSessions(
  options: ListClaudeSessionsOptions = {},
): ClaudeSessionSummary[] {
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const projectsDir = join(claudeConfigDir({ homeDir, env }), "projects");
  if (!existsSync(projectsDir)) return [];
  const sessions: ClaudeSessionSummary[] = [];
  for (const projectDirName of readdirSync(projectsDir)) {
    const projectDir = join(projectsDir, projectDirName);
    let names: string[];
    try {
      if (!statSync(projectDir).isDirectory()) continue;
      names = readdirSync(projectDir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const summary = summarizeClaudeSession(join(projectDir, name));
      if (summary === null) continue;
      if (options.dir !== undefined && summary.cwd !== options.dir) continue;
      sessions.push(summary);
    }
  }
  sessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
  return sessions;
}

function resolveClaudeSessionPathByTitle(args: {
  title: string;
  homeDir: string;
  env: NodeJS.ProcessEnv;
}): string {
  const wanted = args.title.toLowerCase();
  const matches = listClaudeSessions({ homeDir: args.homeDir, env: args.env }).filter(
    (session) => session.title?.toLowerCase() === wanted,
  );
  const [only] = matches;
  if (matches.length === 1 && only !== undefined) return only.sessionPath;
  if (matches.length === 0) {
    throw new Error(
      `"${args.title}" is not a session id, a transcript path, or the title of a Claude Code session on this machine; run \`bb claude-code sessions\` to list them`,
    );
  }
  const listing = matches
    .map(
      (session) =>
        `  ${session.sessionId}  ${new Date(session.lastActivityAt).toISOString()}  ${session.cwd ?? "?"}`,
    )
    .join("\n");
  throw new Error(
    `${matches.length} Claude Code sessions are titled "${args.title}"; import one by id:\n${listing}`,
  );
}

export function resolveClaudeSessionPath(args: {
  session: string;
  homeDir: string;
  env: NodeJS.ProcessEnv;
}): string {
  const session = args.session.trim();
  if (looksLikeSessionPath(session)) {
    if (!isAbsolute(session)) {
      throw new Error(
        `Session transcript paths must be absolute on the machine that holds them; got ${session}`,
      );
    }
    if (!existsSync(session) || !statSync(session).isFile()) {
      throw new Error(`No Claude Code session transcript at ${session}`);
    }
    return session;
  }
  if (!SESSION_ID_PATTERN.test(session)) {
    return resolveClaudeSessionPathByTitle({
      title: session,
      homeDir: args.homeDir,
      env: args.env,
    });
  }
  const projectsDir = join(
    claudeConfigDir({ homeDir: args.homeDir, env: args.env }),
    "projects",
  );
  if (!existsSync(projectsDir)) {
    throw new Error(`No Claude Code projects directory at ${projectsDir}`);
  }
  for (const projectDirName of readdirSync(projectsDir)) {
    const candidate = join(projectsDir, projectDirName, `${session}.jsonl`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No Claude Code session ${session} under ${projectsDir}; run \`claude --resume\` on this machine to see the sessions it knows`,
  );
}

function placeholderRequestId(turnIndex: number): ClientTurnRequestId {
  let suffix = "";
  let value = turnIndex;
  for (let position = 0; position < CLIENT_REQUEST_ID_LENGTH; position += 1) {
    suffix =
      CLIENT_REQUEST_ID_ALPHABET[value % CLIENT_REQUEST_ID_ALPHABET.length] +
      suffix;
    value = Math.floor(value / CLIENT_REQUEST_ID_ALPHABET.length);
  }
  return `creq_${suffix}` as ClientTurnRequestId;
}

function promptInput(text: string): PromptInput[] {
  return [{ type: "text", text, mentions: [] }];
}

export function buildImportedTurns(args: {
  cwd: string | null;
  entries: readonly ConvertedTranscriptEntry[];
  entropyPrefix: string;
}): ImportedSessionTurn[] {
  const translator = createClaudeDeltaTranslator({
    ...(args.cwd === null ? {} : { cwd: args.cwd }),
    sandboxEnabled: false,
  });
  const assembler = createDeltaAssembler({
    providerId: "claude-code",
    entropyPrefix: args.entropyPrefix,
    textDeltaFlushMs: 0,
  });
  const assemble = (deltas: ReturnType<typeof translator.translate>) =>
    assembler.assemble({ threadId: IMPORT_THREAD_ID, deltas });

  const turns: ImportedSessionTurn[] = [];
  let current: ImportedSessionTurn | null = null;
  let leadingEvents: ImportedSessionEvent[] = [];
  const push = (at: number, events: ThreadEvent[]): void => {
    const timed = events.map((event) => ({ at, event }));
    if (current === null) {
      leadingEvents.push(...timed);
    } else {
      current.events.push(...timed);
    }
  };

  for (const entry of args.entries) {
    if (entry.kind === "prompt") {
      const text = entry.text.trim();
      if (text.length === 0) continue;
      current = {
        at: entry.at,
        input: promptInput(text),
        events: [...leadingEvents],
      };
      leadingEvents = [];
      turns.push(current);
      push(
        entry.at,
        assemble(
          translator.acceptInput(
            IMPORT_THREAD_ID,
            placeholderRequestId(turns.length),
          ),
        ),
      );
      continue;
    }
    push(
      entry.at,
      assemble(
        translator.translate(
          {
            jsonrpc: "2.0",
            method: "sdk/message",
            params: { threadId: IMPORT_THREAD_ID, message: entry.message },
          },
          { threadId: IMPORT_THREAD_ID },
        ),
      ),
    );
  }
  const lastAt = current?.events.at(-1)?.at ?? current?.at ?? 0;
  push(lastAt, assemble(translator.buildSessionSettlementDeltas(IMPORT_THREAD_ID)));
  return turns;
}

export function readClaudeSessionTurns(
  options: ReadClaudeSessionTurnsOptions,
): ImportedClaudeSession {
  const homeDir = options.homeDir ?? homedir();
  const env = options.env ?? process.env;
  const sessionPath = resolveClaudeSessionPath({
    session: options.session,
    homeDir,
    env,
  });
  const converted = convertClaudeTranscript({
    sessionPath,
    ...(options.turns === undefined ? {} : { turns: options.turns }),
  });
  const importedTurns = buildImportedTurns({
    cwd: converted.cwd,
    entries: converted.entries,
    entropyPrefix: options.entropyPrefix,
  });
  return {
    sessionId: converted.sessionId,
    sessionPath,
    cwd: converted.cwd,
    model: converted.model,
    title: converted.title,
    turnCount: converted.turnCount,
    turns: converted.turns,
    importedTurns,
  };
}
