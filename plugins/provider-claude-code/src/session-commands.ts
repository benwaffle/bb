import type { SlashCommand } from "@anthropic-ai/claude-agent-sdk";
import type {
  ExperimentalSessionCommand,
  ExperimentalSessionCommandsState,
} from "@get-bb/plugin-sdk/provider-bridge";

export const CLAUDE_PLUGIN_ID = "provider-claude-code";
export const CLAUDE_SESSION_COMMANDS_EXTENSION_NAME = "session-commands";
export const CLAUDE_SESSION_COMMANDS_EXTENSION_KIND =
  `${CLAUDE_PLUGIN_ID}/${CLAUDE_SESSION_COMMANDS_EXTENSION_NAME}` as const;

export const SESSION_COMMAND_DESCRIPTION_MAX_CHARS = 200;
export const SESSION_COMMAND_ARGUMENT_HINT_MAX_CHARS = 120;
export const SESSION_COMMANDS_PAYLOAD_MAX_BYTES = 48 * 1024;
export const SESSION_COMMANDS_MAX = 400;

const INTERNAL_COMMAND_NAME_PREFIX = "__";

export interface ClaudeSessionCommandFilter {
  nonSkillNames: ReadonlySet<string>;
  terminalNames: ReadonlySet<string>;
}

export interface ClaudeSessionCommandInit {
  slash_commands: string[];
  skills: string[];
  terminal_slash_commands?: string[] | undefined;
}

export function claudeSessionCommandFilterFromInit(
  init: ClaudeSessionCommandInit,
): ClaudeSessionCommandFilter {
  const skillNames = new Set(init.skills);
  return {
    nonSkillNames: new Set(
      init.slash_commands.filter((name) => !skillNames.has(name)),
    ),
    terminalNames: new Set(init.terminal_slash_commands ?? []),
  };
}

function isPublishableSessionCommand(
  command: SlashCommand,
  filter: ClaudeSessionCommandFilter,
): boolean {
  return (
    command.name.length > 0 &&
    !command.name.startsWith(INTERNAL_COMMAND_NAME_PREFIX) &&
    !filter.nonSkillNames.has(command.name) &&
    !filter.terminalNames.has(command.name)
  );
}

function truncateText(text: string, maxChars: number): string | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return trimmed.length <= maxChars
    ? trimmed
    : `${trimmed.slice(0, maxChars - 1)}…`;
}

function toSessionCommand(command: SlashCommand): ExperimentalSessionCommand {
  return {
    name: command.name,
    description: truncateText(
      command.description,
      SESSION_COMMAND_DESCRIPTION_MAX_CHARS,
    ),
    argumentHint: truncateText(
      command.argumentHint,
      SESSION_COMMAND_ARGUMENT_HINT_MAX_CHARS,
    ),
    aliases: [...new Set(command.aliases ?? [])].filter(
      (alias) => alias.length > 0,
    ),
  };
}

function payloadBytes(state: ExperimentalSessionCommandsState): number {
  return Buffer.byteLength(JSON.stringify(state));
}

export function buildClaudeSessionCommandsState(
  commands: readonly SlashCommand[],
  filter: ClaudeSessionCommandFilter,
): ExperimentalSessionCommandsState {
  const byName = new Map<string, ExperimentalSessionCommand>();
  for (const command of commands) {
    if (
      !isPublishableSessionCommand(command, filter) ||
      byName.has(command.name)
    ) {
      continue;
    }
    byName.set(command.name, toSessionCommand(command));
  }
  const state: ExperimentalSessionCommandsState = {
    commands: [...byName.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, SESSION_COMMANDS_MAX),
  };
  while (
    state.commands.length > 0 &&
    payloadBytes(state) > SESSION_COMMANDS_PAYLOAD_MAX_BYTES
  ) {
    state.commands.pop();
  }
  return state;
}
