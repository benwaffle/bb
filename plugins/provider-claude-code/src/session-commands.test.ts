import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, it } from "vitest";
import {
  buildClaudeSessionCommandsState,
  claudeSessionCommandFilterFromInit,
  SESSION_COMMAND_DESCRIPTION_MAX_CHARS,
  SESSION_COMMANDS_PAYLOAD_MAX_BYTES,
} from "./session-commands.js";

function command(
  name: string,
  overrides: Partial<SlashCommand> = {},
): SlashCommand {
  return {
    name,
    description: overrides.description ?? `${name} description`,
    argumentHint: overrides.argumentHint ?? "",
    ...(overrides.aliases ? { aliases: overrides.aliases } : {}),
  };
}

const filter = claudeSessionCommandFilterFromInit({
  slash_commands: [
    "code-review",
    "loop",
    "doctor",
    "cape:nucleus",
    "model",
    "compact",
    "__remote-workflow",
  ],
  skills: ["code-review", "loop", "doctor", "cape:nucleus"],
  terminal_slash_commands: ["doctor"],
});

describe("buildClaudeSessionCommandsState", () => {
  it("keeps skills and drops CLI commands, terminal-only skills, and internal names", () => {
    const state = buildClaudeSessionCommandsState(
      [
        command("model", { description: "Set the AI model" }),
        command("compact"),
        command("__remote-workflow"),
        command("doctor"),
        command("loop", {
          argumentHint: "[interval] [prompt]",
          aliases: ["proactive"],
        }),
        command("code-review", { aliases: ["review"] }),
        command("cape:nucleus", { aliases: ["nucleus"] }),
      ],
      filter,
    );
    expect(state.commands.map((entry) => entry.name)).toEqual([
      "cape:nucleus",
      "code-review",
      "loop",
    ]);
    expect(state.commands[2]).toEqual({
      name: "loop",
      description: "loop description",
      argumentHint: "[interval] [prompt]",
      aliases: ["proactive"],
    });
  });

  it("keeps skills the init message did not list, so mid-session discoveries survive", () => {
    const state = buildClaudeSessionCommandsState(
      [command("brand-new-skill")],
      filter,
    );
    expect(state.commands.map((entry) => entry.name)).toEqual([
      "brand-new-skill",
    ]);
  });

  it("turns blank hints and descriptions into null and truncates long descriptions", () => {
    const state = buildClaudeSessionCommandsState(
      [
        command("terse", { description: "   ", argumentHint: "  " }),
        command("verbose", {
          description: "x".repeat(SESSION_COMMAND_DESCRIPTION_MAX_CHARS + 50),
        }),
      ],
      filter,
    );
    expect(state.commands[0]).toEqual({
      name: "terse",
      description: null,
      argumentHint: null,
      aliases: [],
    });
    const verbose = state.commands[1]?.description ?? "";
    expect(verbose).toHaveLength(SESSION_COMMAND_DESCRIPTION_MAX_CHARS);
    expect(verbose.endsWith("…")).toBe(true);
  });

  it("drops duplicate names and keeps the payload under the byte budget", () => {
    const many = Array.from({ length: 1_000 }, (_, index) =>
      command(`skill-${String(index).padStart(4, "0")}`, {
        description: "d".repeat(SESSION_COMMAND_DESCRIPTION_MAX_CHARS),
        argumentHint: "<arg>",
      }),
    );
    const state = buildClaudeSessionCommandsState(
      [...many, command("skill-0000")],
      filter,
    );
    const names = state.commands.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(many.length);
    expect(Buffer.byteLength(JSON.stringify(state))).toBeLessThanOrEqual(
      SESSION_COMMANDS_PAYLOAD_MAX_BYTES,
    );
  });
});
