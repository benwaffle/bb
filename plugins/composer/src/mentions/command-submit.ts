import type { ExperimentalComposerCommandSuggestion } from "@get-bb/plugin-sdk/app";

const SUBMIT_ON_ENTER_COMMANDS = new Set(["clear", "compact"]);

export function commandSuggestionSubmitsOnEnter(
  suggestion: Pick<
    ExperimentalComposerCommandSuggestion,
    "name" | "source" | "origin"
  >,
): boolean {
  return (
    suggestion.source === "command" &&
    suggestion.origin === "builtin" &&
    SUBMIT_ON_ENTER_COMMANDS.has(suggestion.name)
  );
}
