import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listClaudeSessions,
  readClaudeSessionTurns,
  resolveClaudeSessionPath,
  type ImportedSessionTurn,
} from "./session-import.js";

const SESSION_ID = "0f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const CWD = "/tmp/import-project";

interface RawRecordArgs {
  at: string;
  uuid: string;
  parentUuid: string | null;
}

function userPrompt(args: RawRecordArgs & { text: string }) {
  return {
    parentUuid: args.parentUuid,
    isSidechain: false,
    type: "user",
    message: { role: "user", content: args.text },
    uuid: args.uuid,
    timestamp: args.at,
    cwd: CWD,
    sessionId: SESSION_ID,
    version: "2.1.269",
    permissionMode: "auto",
  };
}

function assistant(
  args: RawRecordArgs & {
    messageId: string;
    content: unknown[];
    stopReason: "tool_use" | "end_turn";
  },
) {
  return {
    parentUuid: args.parentUuid,
    isSidechain: false,
    type: "assistant",
    message: {
      model: "claude-fable-5-1",
      id: args.messageId,
      type: "message",
      role: "assistant",
      content: args.content,
      stop_reason: args.stopReason,
      usage: { input_tokens: 5, output_tokens: 7 },
    },
    requestId: `req_${args.uuid}`,
    uuid: args.uuid,
    timestamp: args.at,
    cwd: CWD,
    sessionId: SESSION_ID,
  };
}

function toolResult(
  args: RawRecordArgs & { toolUseId: string; output: string },
) {
  return {
    parentUuid: args.parentUuid,
    isSidechain: false,
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: args.toolUseId,
          content: args.output,
        },
      ],
    },
    toolUseResult: { stdout: args.output, stderr: "", interrupted: false },
    uuid: args.uuid,
    timestamp: args.at,
    cwd: CWD,
    sessionId: SESSION_ID,
  };
}

function writeSession(homeDir: string): string {
  const projectDir = join(homeDir, ".claude", "projects", "-tmp-import-project");
  mkdirSync(projectDir, { recursive: true });
  const records: unknown[] = [
    {
      type: "queue-operation",
      operation: "enqueue",
      timestamp: "2026-09-12T10:00:00.000Z",
      sessionId: SESSION_ID,
    },
    userPrompt({
      at: "2026-09-12T10:00:01.000Z",
      uuid: "u1",
      parentUuid: null,
      text: "add search to settings",
    }),
    assistant({
      at: "2026-09-12T10:00:02.000Z",
      uuid: "a1",
      parentUuid: "u1",
      messageId: "msg_1",
      stopReason: "tool_use",
      content: [
        {
          type: "tool_use",
          id: "toolu_1",
          name: "Bash",
          input: { command: "rg -n search src", description: "Find search" },
        },
      ],
    }),
    toolResult({
      at: "2026-09-12T10:00:03.000Z",
      uuid: "r1",
      parentUuid: "a1",
      toolUseId: "toolu_1",
      output: "src/settings.tsx:10:search",
    }),
    assistant({
      at: "2026-09-12T10:00:04.000Z",
      uuid: "a2",
      parentUuid: "r1",
      messageId: "msg_2",
      stopReason: "end_turn",
      content: [{ type: "text", text: "Done: settings has a search box." }],
    }),
    { type: "ai-title", aiTitle: "Settings search", sessionId: SESSION_ID },
    userPrompt({
      at: "2026-09-12T10:05:00.000Z",
      uuid: "u2",
      parentUuid: "a2",
      text: "make it fuzzy",
    }),
    assistant({
      at: "2026-09-12T10:05:01.000Z",
      uuid: "a3",
      parentUuid: "u2",
      messageId: "msg_3",
      stopReason: "end_turn",
      content: [{ type: "text", text: "Fuzzy matching is in." }],
    }),
  ];
  const path = join(projectDir, `${SESSION_ID}.jsonl`);
  writeFileSync(
    path,
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  return path;
}

function eventTypes(turn: ImportedSessionTurn): string[] {
  return turn.events.map((entry) => entry.event.type);
}

function completedItemTypes(turn: ImportedSessionTurn): string[] {
  return turn.events.flatMap((entry) =>
    entry.event.type === "item/completed" ? [entry.event.item.type] : [],
  );
}

describe("readClaudeSessionTurns", () => {
  const homeDirs: string[] = [];
  function makeHome(): string {
    const dir = mkdtempSync(join(tmpdir(), "claude-import-"));
    homeDirs.push(dir);
    return dir;
  }
  afterEach(() => {
    for (const dir of homeDirs.splice(0)) rmSync(dir, { recursive: true });
  });

  it("replays every human prompt as a turn with its translated events", () => {
    const homeDir = makeHome();
    writeSession(homeDir);

    const session = readClaudeSessionTurns({
      session: SESSION_ID,
      entropyPrefix: "imp0",
      homeDir,
      env: {},
    });

    expect(session.sessionId).toBe(SESSION_ID);
    expect(session.cwd).toBe(CWD);
    expect(session.title).toBe("Settings search");
    expect(session.model).toBe("claude-fable-5-1");
    expect(session.turnCount).toBe(2);
    expect(session.importedTurns).toHaveLength(2);

    const [first, second] = session.importedTurns;
    if (first === undefined || second === undefined) {
      throw new Error("expected two imported turns");
    }
    expect(first.input).toEqual([
      { type: "text", text: "add search to settings", mentions: [] },
    ]);
    expect(first.at).toBe(Date.parse("2026-09-12T10:00:01.000Z"));
    expect(eventTypes(first)).toContain("turn/started");
    expect(eventTypes(first)).toContain("turn/input/accepted");
    expect(eventTypes(first)).toContain("turn/completed");
    expect(completedItemTypes(first)).toContain("commandExecution");
    expect(completedItemTypes(first)).toContain("agentMessage");
    const reply = first.events.find(
      (entry) =>
        entry.event.type === "item/completed" &&
        entry.event.item.type === "agentMessage",
    );
    expect(reply?.event.type === "item/completed" && reply.event.item.type === "agentMessage"
      ? reply.event.item.text
      : null).toBe("Done: settings has a search box.");
    expect(reply?.at).toBe(Date.parse("2026-09-12T10:00:04.000Z"));

    expect(second.input).toEqual([
      { type: "text", text: "make it fuzzy", mentions: [] },
    ]);
    expect(eventTypes(second)).toContain("turn/started");
    expect(eventTypes(second)).toContain("turn/completed");
    expect(completedItemTypes(second)).toEqual(["agentMessage"]);

    const accepted = session.importedTurns.flatMap((turn) =>
      turn.events.flatMap((entry) =>
        entry.event.type === "turn/input/accepted"
          ? [entry.event.clientRequestId]
          : [],
      ),
    );
    expect(accepted).toHaveLength(2);
    expect(new Set(accepted).size).toBe(2);
    for (const id of accepted) {
      expect(id).toMatch(/^creq_[23456789abcdefghijkmnpqrstuvwxyz]{10}$/u);
    }
  });

  it("imports a slice of turns while reporting the full count", () => {
    const homeDir = makeHome();
    const path = writeSession(homeDir);

    const session = readClaudeSessionTurns({
      session: path,
      turns: { from: 2, to: 2 },
      entropyPrefix: "imp1",
      homeDir,
      env: {},
    });

    expect(session.turnCount).toBe(2);
    expect(session.turns).toEqual({ from: 2, to: 2 });
    expect(session.importedTurns.map((turn) => turn.input)).toEqual([
      [{ type: "text", text: "make it fuzzy", mentions: [] }],
    ]);
  });

  it("lists sessions newest first with titles, and resolves a session by its title", () => {
    const homeDir = makeHome();
    const path = writeSession(homeDir);
    const otherDir = join(homeDir, ".claude", "projects", "-tmp-other");
    mkdirSync(otherDir, { recursive: true });
    const otherId = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
    writeFileSync(
      join(otherDir, `${otherId}.jsonl`),
      `${[
        { type: "custom-title", customTitle: "browser-tab-organization", sessionId: otherId },
        {
          type: "user",
          message: { role: "user", content: "check my chrome tabs" },
          uuid: "x1",
          timestamp: "2026-09-13T06:00:00.000Z",
          cwd: "/tmp/other",
          sessionId: otherId,
        },
        {
          type: "assistant",
          message: { role: "assistant", content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" },
          uuid: "x2",
          timestamp: "2026-09-13T06:00:05.000Z",
          cwd: "/tmp/other",
          sessionId: otherId,
        },
      ]
        .map((record) => JSON.stringify(record))
        .join("\n")}\n`,
    );
    mkdirSync(join(homeDir, ".claude", "projects", "-tmp-empty"), { recursive: true });
    writeFileSync(join(homeDir, ".claude", "projects", "-tmp-empty", "11111111-2222-4333-8444-555555555555.jsonl"), "");

    const sessions = listClaudeSessions({ homeDir, env: {} });
    expect(sessions.map((session) => session.sessionId)).toEqual([otherId, SESSION_ID]);
    expect(sessions[0]).toMatchObject({
      title: "browser-tab-organization",
      cwd: "/tmp/other",
      firstPrompt: "check my chrome tabs",
      turnCount: 1,
      lastActivityAt: Date.parse("2026-09-13T06:00:05.000Z"),
    });
    expect(sessions[1]).toMatchObject({
      title: "Settings search",
      cwd: CWD,
      turnCount: 2,
      sessionPath: path,
    });
    expect(listClaudeSessions({ homeDir, env: {}, dir: CWD }).map((s) => s.sessionId)).toEqual([SESSION_ID]);

    expect(
      resolveClaudeSessionPath({ session: "Browser-Tab-Organization", homeDir, env: {} }),
    ).toBe(join(otherDir, `${otherId}.jsonl`));
    expect(() =>
      resolveClaudeSessionPath({ session: "no such title", homeDir, env: {} }),
    ).toThrow(/bb claude-code sessions/u);
  });

  it("finds sessions under a relocated config directory and rejects unknown ids", () => {
    const homeDir = makeHome();
    const configDir = join(homeDir, "elsewhere");
    mkdirSync(join(configDir, "projects", "-tmp-x"), { recursive: true });
    const path = join(configDir, "projects", "-tmp-x", `${SESSION_ID}.jsonl`);
    writeFileSync(path, "");

    expect(
      resolveClaudeSessionPath({
        session: SESSION_ID,
        homeDir,
        env: { CLAUDE_CONFIG_DIR: configDir },
      }),
    ).toBe(path);
    expect(() =>
      resolveClaudeSessionPath({ session: "not-a-session", homeDir, env: {} }),
    ).toThrow(/not a session id, a transcript path, or the title/u);
    expect(() =>
      resolveClaudeSessionPath({
        session: "11111111-2222-4333-8444-555555555555",
        homeDir,
        env: { CLAUDE_CONFIG_DIR: configDir },
      }),
    ).toThrow(/No Claude Code session 11111111/u);
  });
});
