import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type TranscriptRecord = Record<string, unknown>;

interface TimedRecord {
  record: TranscriptRecord;
  at: number;
}

interface TranscriptSubagent {
  agentId: string;
  toolUseId: string | null;
  agentType: string | null;
  description: string | null;
  records: TimedRecord[];
}

interface MergedRecord extends TimedRecord {
  order: number;
  lane: 0 | 1;
  agent: TranscriptSubagent | null;
  continuesInNextRootAssistant?: boolean;
}

export type ConvertedTranscriptEntry =
  | { kind: "prompt"; at: number; text: string }
  | { kind: "message"; at: number; message: TranscriptRecord };

export interface ConvertedTranscript {
  sessionId: string;
  cwd: string | null;
  model: string | null;
  title: string | null;
  turnCount: number;
  turns: { from: number; to: number };
  entries: ConvertedTranscriptEntry[];
}

export interface ConvertClaudeTranscriptOptions {
  sessionPath: string;
  turns?: { from: number; to: number };
}

const STREAMED_RECORD_TYPES = new Set(["user", "assistant", "system"]);

export function isRecord(value: unknown): value is TranscriptRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readTranscriptLines(path: string): TranscriptRecord[] {
  const records: TranscriptRecord[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (isRecord(parsed)) records.push(parsed);
  }
  return records;
}

function readStreamedRecords(lines: TranscriptRecord[]): TimedRecord[] {
  const records: TimedRecord[] = [];
  let lastTimestamp = 0;
  for (const record of lines) {
    if (
      typeof record.type !== "string" ||
      !STREAMED_RECORD_TYPES.has(record.type)
    ) {
      continue;
    }
    const parsed = Date.parse(
      typeof record.timestamp === "string" ? record.timestamp : "",
    );
    const at = Number.isNaN(parsed) ? lastTimestamp : parsed;
    lastTimestamp = at;
    records.push({ record, at });
  }
  return records;
}

function readSubagents(sessionPath: string): TranscriptSubagent[] {
  const sessionId = basename(sessionPath, ".jsonl");
  const dir = join(dirname(sessionPath), sessionId, "subagents");
  if (!existsSync(dir)) return [];
  const agents: TranscriptSubagent[] = [];
  for (const name of readdirSync(dir).sort()) {
    const match = /^agent-([A-Za-z0-9]+)\.jsonl$/.exec(name);
    if (!match) continue;
    const agentId = match[1] ?? "";
    const metaPath = join(dir, `agent-${agentId}.meta.json`);
    let meta: TranscriptRecord = {};
    if (existsSync(metaPath)) {
      try {
        const parsed: unknown = JSON.parse(readFileSync(metaPath, "utf8"));
        if (isRecord(parsed)) meta = parsed;
      } catch {
        meta = {};
      }
    }
    agents.push({
      agentId,
      toolUseId: stringOrNull(meta.toolUseId),
      agentType: stringOrNull(meta.agentType),
      description: stringOrNull(meta.description),
      records: readStreamedRecords(readTranscriptLines(join(dir, name))),
    });
  }
  return agents;
}

function messageOf(record: TranscriptRecord): TranscriptRecord | null {
  return isRecord(record.message) ? record.message : null;
}

function contentBlocks(record: TranscriptRecord): TranscriptRecord[] {
  const content = messageOf(record)?.content;
  return Array.isArray(content) ? content.filter(isRecord) : [];
}

function toolUseBlocks(record: TranscriptRecord): TranscriptRecord[] {
  return contentBlocks(record).filter((block) => block.type === "tool_use");
}

function toolResultBlocks(record: TranscriptRecord): TranscriptRecord[] {
  return contentBlocks(record).filter((block) => block.type === "tool_result");
}

export function isRootPrompt(record: TranscriptRecord): boolean {
  return (
    record.type === "user" &&
    record.isSidechain !== true &&
    record.isMeta !== true &&
    toolResultBlocks(record).length === 0
  );
}

export function isTaskNotificationPrompt(record: TranscriptRecord): boolean {
  return (
    isRootPrompt(record) &&
    isRecord(record.origin) &&
    record.origin.kind === "task-notification"
  );
}

export function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .filter(
        (block): block is TranscriptRecord & { text: string } =>
          isRecord(block) &&
          block.type === "text" &&
          typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

function assistantText(record: TranscriptRecord): string {
  return textOf(messageOf(record)?.content);
}

function isApiErrorAssistant(record: TranscriptRecord): boolean {
  return (
    record.isApiErrorMessage === true ||
    record.error !== undefined ||
    record.apiErrorStatus !== undefined
  );
}

interface TaskNotification {
  taskId: string;
  toolUseId: string;
  outputFile: string;
  status: "completed" | "failed" | "stopped";
  summary: string;
  result: string;
}

function parseTaskNotification(text: string): TaskNotification | null {
  const field = (name: string): string => {
    const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(text);
    return match?.[1]?.trim() ?? "";
  };
  const taskId = field("task-id");
  if (taskId.length === 0) return null;
  const status = field("status");
  return {
    taskId,
    toolUseId: field("tool-use-id"),
    outputFile: field("output-file"),
    status:
      status === "completed" || status === "failed" || status === "stopped"
        ? status
        : "completed",
    summary: field("summary"),
    result: field("result"),
  };
}

function apiErrorCode(status: unknown): string {
  if (status === 401 || status === 403) return "authentication_failed";
  if (status === 429) return "rate_limit";
  if (status === 400) return "invalid_request";
  if (status === 404) return "model_not_found";
  if (typeof status === "number" && status >= 500) return "server_error";
  return "unknown";
}

function assignTurns(records: TimedRecord[]): {
  turnByIndex: number[];
  turnCount: number;
} {
  let turn = 0;
  const turnByIndex: number[] = [];
  for (const { record } of records) {
    if (isRootPrompt(record) && !isTaskNotificationPrompt(record)) {
      turn += 1;
    }
    turnByIndex.push(Math.max(turn, 1));
  }
  return { turnByIndex, turnCount: Math.max(turn, 1) };
}

export function sessionTitle(lines: TranscriptRecord[]): string | null {
  let customTitle: string | null = null;
  let agentName: string | null = null;
  let aiTitle: string | null = null;
  for (const record of lines) {
    if (record.type === "custom-title" && typeof record.customTitle === "string") {
      customTitle = record.customTitle;
    } else if (record.type === "agent-name" && typeof record.agentName === "string") {
      agentName = record.agentName;
    } else if (record.type === "ai-title" && typeof record.aiTitle === "string") {
      aiTitle = record.aiTitle;
    }
  }
  return customTitle ?? agentName ?? aiTitle;
}

export function convertClaudeTranscript(
  options: ConvertClaudeTranscriptOptions,
): ConvertedTranscript {
  const sessionPath = options.sessionPath;
  const sessionId = basename(sessionPath, ".jsonl");
  const lines = readTranscriptLines(sessionPath);
  const main = readStreamedRecords(lines);
  const agents = readSubagents(sessionPath);
  if (main.length === 0) {
    throw new Error(`${sessionPath}: no user/assistant/system records`);
  }

  const agentIdByToolUseId = new Map<string, string>();
  const agentByToolUseId = new Map<string, TranscriptSubagent>();
  for (const agent of agents) {
    if (agent.toolUseId !== null) {
      agentIdByToolUseId.set(agent.toolUseId, agent.agentId);
      agentByToolUseId.set(agent.toolUseId, agent);
    }
  }
  const backgroundedToolUseIds = new Set<string>();
  for (const { record } of main) {
    if (record.type !== "user") continue;
    const result = record.toolUseResult;
    if (!isRecord(result)) continue;
    for (const block of toolResultBlocks(record)) {
      const toolUseId = block.tool_use_id;
      if (typeof toolUseId !== "string") continue;
      if (typeof result.agentId === "string") {
        agentIdByToolUseId.set(toolUseId, result.agentId);
      }
      if (result.status === "async_launched" || result.isAsync === true) {
        backgroundedToolUseIds.add(toolUseId);
      }
    }
  }

  const agentCallByToolUseId = new Map<string, TranscriptRecord>();
  for (const { record } of main) {
    if (record.type !== "assistant") continue;
    for (const block of toolUseBlocks(record)) {
      if (
        (block.name === "Agent" || block.name === "Task") &&
        typeof block.id === "string"
      ) {
        agentCallByToolUseId.set(
          block.id,
          isRecord(block.input) ? block.input : {},
        );
      }
    }
  }

  const { turnByIndex, turnCount } = assignTurns(main);
  const from = options.turns?.from ?? 1;
  const to = Math.min(options.turns?.to ?? turnCount, turnCount);
  if (from < 1 || to < from || from > turnCount) {
    throw new Error(
      `turns ${from}-${to} is outside the session's ${turnCount} turn(s)`,
    );
  }
  const selected = main.filter((_, index) => {
    const turn = turnByIndex[index] ?? 1;
    return turn >= from && turn <= to;
  });
  const selectedToolUseIds = new Set<string>();
  for (const { record } of selected) {
    for (const block of toolUseBlocks(record)) {
      if (typeof block.id === "string") selectedToolUseIds.add(block.id);
    }
  }

  const merged: MergedRecord[] = selected.map((entry, order) => ({
    ...entry,
    order,
    lane: 0,
    agent: null,
  }));
  for (const agent of agents) {
    if (agent.toolUseId === null || !selectedToolUseIds.has(agent.toolUseId)) {
      continue;
    }
    agent.records.forEach((entry, order) => {
      merged.push({ ...entry, order, lane: 1, agent });
    });
  }
  merged.sort((a, b) => a.at - b.at || a.lane - b.lane || a.order - b.order);
  let previousRoot: MergedRecord | null = null;
  for (const entry of merged) {
    if (entry.lane !== 0 || entry.record.type !== "assistant") continue;
    entry.continuesInNextRootAssistant = false;
    const messageId = messageOf(entry.record)?.id;
    if (
      previousRoot !== null &&
      typeof messageId === "string" &&
      messageOf(previousRoot.record)?.id === messageId
    ) {
      previousRoot.continuesInNextRootAssistant = true;
    }
    previousRoot = entry;
  }

  const first = main[0]?.record ?? {};
  const entries: ConvertedTranscriptEntry[] = [];
  let syntheticIds = 0;
  const syntheticUuid = (): string => {
    syntheticIds += 1;
    return `00000000-0000-4000-8000-${String(syntheticIds).padStart(12, "0")}`;
  };
  const emit = (at: number, message: TranscriptRecord): void => {
    entries.push({ kind: "message", at, message });
  };

  const toolNames = new Set<string>();
  let model: string | null = null;
  for (const { record } of merged) {
    if (record.type !== "assistant") continue;
    const recordModel = messageOf(record)?.model;
    if (model === null && typeof recordModel === "string") {
      model = recordModel;
    }
    for (const block of toolUseBlocks(record)) {
      if (typeof block.name === "string") toolNames.add(block.name);
    }
  }

  const firstAt = main[0]?.at ?? 0;
  const cwd = stringOrNull(first.cwd);
  emit(firstAt, {
    type: "system",
    subtype: "init",
    cwd: cwd ?? "",
    session_id: sessionId,
    tools: [...toolNames].sort(),
    mcp_servers: [],
    model: model ?? "unknown",
    permissionMode: stringOrNull(first.permissionMode) ?? "default",
    slash_commands: [],
    apiKeySource: "none",
    claude_code_version: stringOrNull(first.version) ?? "unknown",
    output_style: "default",
    agents: [],
    skills: [],
    plugins: [],
    uuid: syntheticUuid(),
  });

  let turnOpen = false;
  let turnStartedAt = 0;
  let turnOrigin: TranscriptRecord | null = null;
  let turnAssistantCount = 0;
  let lastRootAssistant: TranscriptRecord | null = null;
  let lastAt = firstAt;
  const usage: Record<string, number> = {
    input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    output_tokens: 0,
  };
  const resetUsage = (): void => {
    for (const key of Object.keys(usage)) usage[key] = 0;
  };
  const openTurn = (at: number, origin: TranscriptRecord | null): void => {
    if (turnOpen) return;
    turnOpen = true;
    turnStartedAt = at;
    turnOrigin = origin;
    turnAssistantCount = 0;
    lastRootAssistant = null;
    resetUsage();
  };
  const closeTurn = (at: number): void => {
    if (!turnOpen) return;
    const failed =
      lastRootAssistant !== null && isApiErrorAssistant(lastRootAssistant);
    const text =
      lastRootAssistant === null ? "" : assistantText(lastRootAssistant);
    emit(at, {
      type: "result",
      subtype: failed ? "error_during_execution" : "success",
      is_error: failed,
      duration_ms: Math.max(0, at - turnStartedAt),
      duration_api_ms: Math.max(0, at - turnStartedAt),
      num_turns: turnAssistantCount,
      result: text,
      ...(failed ? { errors: [text] } : {}),
      session_id: sessionId,
      total_cost_usd: 0,
      usage: { ...usage },
      permission_denials: [],
      ...(turnOrigin === null ? {} : { origin: turnOrigin }),
      uuid: syntheticUuid(),
    });
    turnOpen = false;
  };
  const addUsage = (messageUsage: unknown): void => {
    if (!isRecord(messageUsage)) return;
    for (const key of Object.keys(usage)) {
      const value = messageUsage[key];
      if (typeof value === "number") usage[key] = (usage[key] ?? 0) + value;
    }
  };

  const settledTaskIds = new Set<string>();
  const emitTaskStarted = (
    at: number,
    toolUseId: string,
    backgrounded: boolean,
  ): void => {
    const taskId = agentIdByToolUseId.get(toolUseId);
    if (taskId === undefined) return;
    const call = agentCallByToolUseId.get(toolUseId) ?? {};
    const agent = agentByToolUseId.get(toolUseId);
    emit(at, {
      type: "system",
      subtype: "task_started",
      task_id: taskId,
      tool_use_id: toolUseId,
      description:
        typeof call.description === "string"
          ? call.description
          : (agent?.description ?? ""),
      subagent_type:
        typeof call.subagent_type === "string"
          ? call.subagent_type
          : (agent?.agentType ?? "general-purpose"),
      is_backgrounded: backgrounded,
      spawn_depth: 1,
      task_type: "local_agent",
      ...(typeof call.prompt === "string" ? { prompt: call.prompt } : {}),
      uuid: syntheticUuid(),
      session_id: sessionId,
    });
  };
  const emitTaskSettled = (
    at: number,
    taskId: string,
    toolUseId: string,
    status: string,
    summary: string,
    outputFile: string,
  ): void => {
    if (settledTaskIds.has(taskId)) return;
    settledTaskIds.add(taskId);
    emit(at, {
      type: "system",
      subtype: "task_updated",
      task_id: taskId,
      patch: { status: status === "completed" ? "completed" : "failed" },
      uuid: syntheticUuid(),
      session_id: sessionId,
    });
    emit(at, {
      type: "system",
      subtype: "task_notification",
      task_id: taskId,
      tool_use_id: toolUseId,
      status,
      output_file: outputFile,
      summary,
      uuid: syntheticUuid(),
      session_id: sessionId,
    });
  };

  for (const entry of merged) {
    const { record, at, agent } = entry;
    lastAt = at;
    const parentToolUseId = agent === null ? null : agent.toolUseId;
    const uuid = typeof record.uuid === "string" ? record.uuid : syntheticUuid();
    const timestamp =
      typeof record.timestamp === "string" ? record.timestamp : undefined;

    if (record.type === "system") {
      if (record.subtype === "api_error" && record.source === "request_retry") {
        openTurn(at, null);
        const error = isRecord(record.error) ? record.error : {};
        emit(at, {
          type: "system",
          subtype: "api_retry",
          attempt: record.retryAttempt ?? 1,
          max_retries: record.maxRetries ?? 1,
          retry_delay_ms: record.retryInMs ?? 0,
          error_status: error.status ?? null,
          error: apiErrorCode(error.status),
          uuid,
          session_id: sessionId,
        });
      } else if (
        record.subtype === "model_refusal_fallback" ||
        record.subtype === "model_fallback"
      ) {
        emit(at, {
          type: "system",
          subtype: record.subtype,
          original_model: record.originalModel,
          fallback_model: record.fallbackModel,
          ...(typeof record.content === "string"
            ? { content: record.content }
            : {}),
          uuid,
          session_id: sessionId,
        });
      } else if (record.subtype === "compact_boundary") {
        const compactMetadata = isRecord(record.compactMetadata)
          ? record.compactMetadata
          : {};
        emit(at, {
          type: "system",
          subtype: "compact_boundary",
          compact_metadata: {
            trigger: compactMetadata.trigger ?? "auto",
            pre_tokens: compactMetadata.preTokens ?? 0,
          },
          uuid,
          session_id: sessionId,
        });
      }
      continue;
    }

    if (record.type === "assistant") {
      if (agent === null) {
        openTurn(at, null);
        turnAssistantCount += 1;
        lastRootAssistant = record;
        addUsage(messageOf(record)?.usage);
      }
      emit(at, {
        type: "assistant",
        message: record.message,
        parent_tool_use_id: parentToolUseId,
        ...(typeof record.requestId === "string"
          ? { request_id: record.requestId }
          : {}),
        session_id: sessionId,
        uuid,
        ...(timestamp === undefined ? {} : { timestamp }),
      });
      if (agent === null) {
        for (const block of toolUseBlocks(record)) {
          if (
            (block.name === "Agent" || block.name === "Task") &&
            typeof block.id === "string"
          ) {
            emitTaskStarted(at, block.id, backgroundedToolUseIds.has(block.id));
          }
        }
        const stopReason = messageOf(record)?.stop_reason;
        if (
          (stopReason === "end_turn" ||
            stopReason === "stop_sequence" ||
            stopReason === "max_tokens") &&
          entry.continuesInNextRootAssistant !== true
        ) {
          closeTurn(at);
        }
      }
      continue;
    }

    const results = toolResultBlocks(record);
    if (results.length === 0) {
      if (agent !== null) {
        emit(at, {
          type: "user",
          message: record.message,
          parent_tool_use_id: parentToolUseId,
          session_id: sessionId,
          uuid,
          ...(timestamp === undefined ? {} : { timestamp }),
          ...(agent.agentType === null
            ? {}
            : { subagent_type: agent.agentType }),
          ...(agent.description === null
            ? {}
            : { task_description: agent.description }),
        });
        continue;
      }
      const notification = isTaskNotificationPrompt(record)
        ? parseTaskNotification(textOf(messageOf(record)?.content))
        : null;
      if (!isRootPrompt(record)) {
        emit(at, {
          type: "user",
          message: record.message,
          parent_tool_use_id: null,
          session_id: sessionId,
          uuid,
          ...(timestamp === undefined ? {} : { timestamp }),
        });
        continue;
      }
      if (notification !== null) {
        closeTurn(at);
        emitTaskSettled(
          at,
          notification.taskId,
          notification.toolUseId,
          notification.status,
          notification.summary,
          notification.outputFile,
        );
        openTurn(at, { kind: "task-notification" });
        emit(at, {
          type: "user",
          message: record.message,
          parent_tool_use_id: null,
          session_id: sessionId,
          uuid,
          ...(timestamp === undefined ? {} : { timestamp }),
        });
        continue;
      }
      closeTurn(at);
      entries.push({
        kind: "prompt",
        at,
        text: textOf(messageOf(record)?.content),
      });
      openTurn(at, null);
      continue;
    }

    if (agent === null) {
      for (const block of results) {
        const toolUseId = block.tool_use_id;
        if (
          typeof toolUseId === "string" &&
          agentCallByToolUseId.has(toolUseId) &&
          !backgroundedToolUseIds.has(toolUseId)
        ) {
          const taskId = agentIdByToolUseId.get(toolUseId);
          if (taskId !== undefined) {
            emitTaskSettled(
              at,
              taskId,
              toolUseId,
              block.is_error === true ? "failed" : "completed",
              textOf(block.content).split("\n")[0] ?? "",
              "",
            );
          }
        }
      }
    }
    emit(at, {
      type: "user",
      message: record.message,
      parent_tool_use_id: parentToolUseId,
      session_id: sessionId,
      uuid,
      ...(timestamp === undefined ? {} : { timestamp }),
      ...(record.toolUseResult === undefined
        ? {}
        : { tool_use_result: record.toolUseResult }),
    });
  }
  closeTurn(lastAt);

  return {
    sessionId,
    cwd,
    model,
    title: sessionTitle(lines),
    turnCount,
    turns: { from, to },
    entries,
  };
}
