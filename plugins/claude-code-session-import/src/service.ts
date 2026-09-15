import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { claudeSessionImportHostContract } from "./host-contract.js";
import {
  sessionHiddenReason,
  type SessionHiddenReason,
} from "./session-visibility.js";

type ImportArgs = Parameters<
  BbPluginApi["sdk"]["threads"]["experimental_import"]
>[0];
type ImportedTurns = ImportArgs["turns"];
type ImportedEvent = ImportedTurns[number]["events"][number]["event"];
export type ImportEnvironment = ImportArgs["environment"];

export interface MachineChoice {
  id: string;
  name: string;
  connected: boolean;
}

export type SelectedMachine = MachineChoice;

export interface ProjectChoice {
  id: string;
  name: string;
  kind: "standard" | "personal";
}

export interface SessionListing {
  machine: SelectedMachine;
  machines: MachineChoice[];
  projects: ProjectChoice[];
  sessions: SessionListEntry[];
}

export interface SessionListEntry {
  sessionId: string;
  sessionPath: string;
  cwd: string | null;
  title: string | null;
  firstPrompt: string | null;
  lastActivityAt: number;
  turnCount: number;
  bbDriven: boolean;
  projectId: string | null;
  projectName: string | null;
  hiddenReason: SessionHiddenReason | null;
}

export interface ImportSessionRequest {
  session: string;
  machine: string | null;
  projectId: string | null;
  environment: string | null;
  title: string | null;
  turns: { from: number; to: number } | null;
  fallbackProjectId: string | undefined;
  signal: AbortSignal | undefined;
}

export interface ImportSessionResult {
  thread: Awaited<
    ReturnType<BbPluginApi["sdk"]["threads"]["experimental_import"]>
  >;
  session: {
    id: string;
    path: string;
    cwd: string | null;
    turnCount: number;
    importedTurns: { from: number; to: number };
  };
}

export class SessionImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionImportError";
  }
}

const INITIAL_TURN_BATCH = 8;
const HOST_CALL_TIMEOUT_MS = 5 * 60 * 1000;
const IMPORTED_SESSION_PREFIX = "imported-session:";
const HELD_SESSION_PREFIX = "held-session:";
export const CLAUDE_CODE_PROVIDER_ID = "claude-code";

interface ImportedSessionRecord {
  threadId: string;
  importedAt: number;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isResultTooLargeError(error: unknown): boolean {
  return /exceeds .* bytes/u.test(errorMessage(error));
}

function callOptions(hostId: string, signal: AbortSignal | undefined) {
  return {
    hostId,
    timeoutMs: HOST_CALL_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  };
}

export function createClaudeSessionImportService(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({
    contract: claudeSessionImportHostContract,
  });

  async function listMachines(
    signal: AbortSignal | undefined,
  ): Promise<MachineChoice[]> {
    const hosts = await bb.sdk.hosts.list(signal ? { signal } : undefined);
    return hosts.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      connected: candidate.status === "connected",
    }));
  }

  async function selectMachine(
    machine: string | null,
    signal: AbortSignal | undefined,
  ): Promise<{ selected: SelectedMachine; machines: MachineChoice[] }> {
    const machines = await listMachines(signal);
    if (machine !== null) {
      const selected = machines.find(
        (candidate) => candidate.id === machine || candidate.name === machine,
      );
      if (selected === undefined) {
        throw new SessionImportError(`No machine "${machine}"`);
      }
      if (!selected.connected) {
        throw new SessionImportError(
          `Machine ${selected.name} (${selected.id}) is not connected`,
        );
      }
      return { selected, machines };
    }
    const connected = machines.filter((candidate) => candidate.connected);
    const [only] = connected;
    if (connected.length === 1 && only !== undefined) {
      return { selected: only, machines };
    }
    if (connected.length === 0) {
      throw new SessionImportError(
        "No connected machine can read Claude Code sessions",
      );
    }
    throw new SessionImportError(
      `Several machines are connected; pick the one holding the session with --machine:\n${connected
        .map((candidate) => `  ${candidate.id}  ${candidate.name}`)
        .join("\n")}`,
    );
  }

  async function listProjects(signal: AbortSignal | undefined) {
    const projects = await bb.sdk.projects.list({
      includePersonal: true,
      ...(signal ? { signal } : {}),
    });
    return projects.map((project) => ({
      id: project.id,
      name: project.name,
      kind: project.kind,
      sources: project.sources
        .filter((source) => source.type === "local_path")
        .map((source) => ({ hostId: source.hostId, path: source.path })),
    }));
  }

  async function liveProviderSessionIds(
    signal: AbortSignal | undefined,
  ): Promise<Set<string>> {
    const result = await bb.sdk.threads.experimental_providerSessions({
      providerId: CLAUDE_CODE_PROVIDER_ID,
      ...(signal ? { signal } : {}),
    });
    return new Set(result.sessions.map((entry) => entry.providerThreadId));
  }

  async function rememberProviderSessionIds(
    sessionIds: Iterable<string>,
    known: ReadonlySet<string>,
  ): Promise<void> {
    for (const sessionId of sessionIds) {
      if (known.has(sessionId)) continue;
      await bb.storage.kv.set(`${HELD_SESSION_PREFIX}${sessionId}`, {
        heldAt: Date.now(),
      });
    }
  }

  async function heldProviderSessionIds(): Promise<Set<string>> {
    const keys = await bb.storage.kv.list(HELD_SESSION_PREFIX);
    return new Set(keys.map((key) => key.slice(HELD_SESSION_PREFIX.length)));
  }

  async function ownedWorkspacePaths(
    hostId: string,
    signal: AbortSignal | undefined,
  ): Promise<string[]> {
    const environments = await bb.sdk.environments.list({
      hostId,
      ...(signal ? { signal } : {}),
    });
    const paths: string[] = [];
    for (const environment of environments) {
      if (environment.managed && environment.path !== null) {
        paths.push(environment.path);
      }
    }
    return paths;
  }

  async function knownThreadIds(
    signal: AbortSignal | undefined,
  ): Promise<Set<string>> {
    const threads = await bb.sdk.threads.list({
      includeHidden: true,
      ...(signal ? { signal } : {}),
    });
    return new Set(threads.map((thread) => thread.id));
  }

  async function providerSessionIds(
    signal: AbortSignal | undefined,
  ): Promise<Set<string>> {
    const [live, held] = await Promise.all([
      liveProviderSessionIds(signal),
      heldProviderSessionIds(),
    ]);
    await rememberProviderSessionIds(live, held);
    for (const sessionId of held) live.add(sessionId);
    return live;
  }

  async function recordHeldProviderSessions(): Promise<void> {
    const [live, held] = await Promise.all([
      liveProviderSessionIds(undefined),
      heldProviderSessionIds(),
    ]);
    await rememberProviderSessionIds(live, held);
  }

  async function importedSessionIds(
    signal: AbortSignal | undefined,
  ): Promise<Set<string>> {
    const keys = await bb.storage.kv.list(IMPORTED_SESSION_PREFIX);
    if (keys.length === 0) return new Set();
    const threads = await bb.sdk.threads.list({
      originPluginId: bb.pluginId,
      includeHidden: true,
      ...(signal ? { signal } : {}),
    });
    const liveThreadIds = new Set(threads.map((thread) => thread.id));
    const imported = new Set<string>();
    for (const key of keys) {
      const record = await bb.storage.kv.get<ImportedSessionRecord>(key);
      if (record === undefined) continue;
      if (liveThreadIds.has(record.threadId)) {
        imported.add(key.slice(IMPORTED_SESSION_PREFIX.length));
        continue;
      }
      await bb.storage.kv.delete(key);
    }
    return imported;
  }

  async function listSessions(args: {
    machine: string | null;
    dir: string | null;
    signal: AbortSignal | undefined;
  }): Promise<SessionListing> {
    const { selected, machines } = await selectMachine(
      args.machine,
      args.signal,
    );
    const [
      result,
      projects,
      providerSessions,
      imported,
      ownedPaths,
      threadIds,
    ] = await Promise.all([
      host.call(
        "listClaudeSessions",
        args.dir === null ? {} : { dir: args.dir },
        callOptions(selected.id, args.signal),
      ),
      listProjects(args.signal),
      providerSessionIds(args.signal),
      importedSessionIds(args.signal),
      ownedWorkspacePaths(selected.id, args.signal),
      knownThreadIds(args.signal),
    ]);
    const projectByPath = new Map<string, { id: string; name: string }>();
    for (const project of projects) {
      for (const source of project.sources) {
        if (source.hostId === selected.id) {
          projectByPath.set(source.path, {
            id: project.id,
            name: project.name,
          });
        }
      }
    }
    return {
      machine: selected,
      machines,
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        kind: project.kind,
      })),
      sessions: result.sessions.map((session) => {
        const project =
          session.cwd === null ? undefined : projectByPath.get(session.cwd);
        return {
          ...session,
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
          hiddenReason: sessionHiddenReason(session, {
            importedSessionIds: imported,
            providerSessionIds: providerSessions,
            ownedWorkspacePaths: ownedPaths,
            threadIds,
          }),
        };
      }),
    };
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
      callOptions(args.hostId, args.signal),
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
          callOptions(args.hostId, args.signal),
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
      const projects = await listProjects(args.signal);
      const match = projects.find((project) =>
        project.sources.some(
          (source) => source.hostId === args.hostId && source.path === args.cwd,
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
  }): Promise<ImportEnvironment> {
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
    const project = (await listProjects(args.signal)).find(
      (candidate) => candidate.id === args.projectId,
    );
    if (project?.kind === "personal") {
      return {
        type: "host",
        hostId: args.hostId,
        workspace: { type: "personal" },
      };
    }
    const cwdIsProjectSource =
      args.cwd !== null &&
      project !== undefined &&
      project.sources.some(
        (source) => source.hostId === args.hostId && source.path === args.cwd,
      );
    if (args.cwd === null || !cwdIsProjectSource) {
      return { type: "project-default" };
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

  async function importSession(
    request: ImportSessionRequest,
  ): Promise<ImportSessionResult> {
    const { selected } = await selectMachine(request.machine, request.signal);
    const session = await readAllTurns({
      hostId: selected.id,
      session: request.session,
      range: request.turns,
      signal: request.signal,
    });
    if (session.importedTurns.length === 0) {
      throw new SessionImportError(
        `Session ${session.sessionId} has no prompts to import in turns ${session.turns.from}-${session.turns.to}`,
      );
    }
    const projectId = await resolveProjectId({
      cwd: session.cwd,
      hostId: selected.id,
      requested: request.projectId,
      fallback: request.fallbackProjectId,
      signal: request.signal,
    });
    if (projectId === null) {
      throw new SessionImportError(
        `No bb project has ${session.cwd ?? "the session's directory"} as a source on ${selected.name}; pass --project <id>`,
      );
    }
    const environment = await resolveEnvironment({
      cwd: session.cwd,
      hostId: selected.id,
      projectId,
      requested: request.environment,
      signal: request.signal,
    });
    const turns: ImportedTurns = session.importedTurns.map((turn) => ({
      at: turn.at,
      input: turn.input as ImportedTurns[number]["input"],
      events: turn.events.map((entry) => ({
        at: entry.at,
        event: entry.event as ImportedEvent,
      })),
    }));
    const title = request.title ?? session.title ?? undefined;
    const thread = await bb.sdk.threads.experimental_import({
      projectId,
      providerId: CLAUDE_CODE_PROVIDER_ID,
      environment,
      sourceProviderThreadId: session.sessionId,
      turns,
      ...(title === undefined ? {} : { title }),
      ...(session.model === null ? {} : { model: session.model }),
    });
    const importedRecord: ImportedSessionRecord = {
      threadId: thread.id,
      importedAt: Date.now(),
    };
    await bb.storage.kv.set(
      `${IMPORTED_SESSION_PREFIX}${session.sessionId}`,
      importedRecord,
    );
    return {
      thread,
      session: {
        id: session.sessionId,
        path: session.sessionPath,
        cwd: session.cwd,
        turnCount: session.turnCount,
        importedTurns: session.turns,
      },
    };
  }

  return {
    importSession,
    listMachines,
    listSessions,
    recordHeldProviderSessions,
  };
}

export type ClaudeSessionImportService = ReturnType<
  typeof createClaudeSessionImportService
>;
