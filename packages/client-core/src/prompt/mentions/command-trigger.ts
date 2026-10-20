import type {
  ProviderComposerCommand,
  PromptMentionCommandTrigger,
  ProviderComposerAction,
} from "@bb/domain";
import type {
  ProviderCommandOrigin,
  ProviderCommandSource,
} from "@bb/server-contract";

export type ProviderPromptActionCommand = ProviderComposerCommand;

interface ProviderPromptAction {
  kind: "goal" | "plan" | "skills";
  text: string;
  command?: ProviderPromptActionCommand;
}

interface ProviderPromptActionProps {
  skillsTriggers: readonly PromptMentionCommandTrigger[];
  promptActions: readonly ProviderPromptAction[];
}

export function buildProviderPromptActionProps(
  composerActions: readonly ProviderComposerAction[],
): ProviderPromptActionProps {
  const promptActions: ProviderPromptAction[] = [];
  const skillsTriggers: PromptMentionCommandTrigger[] = [];

  for (const action of composerActions) {
    switch (action.kind) {
      case "skills":
        skillsTriggers.push(action.trigger);
        if (!promptActions.some((candidate) => candidate.kind === "skills")) {
          promptActions.push({
            kind: action.kind,
            text: action.trigger,
          });
        }
        break;
      case "goal":
      case "plan":
        promptActions.push({
          kind: action.kind,
          command: action.command,
          text: serializedProviderCommand(action.command),
        });
        break;
    }
  }

  return { skillsTriggers, promptActions };
}

function serializedProviderCommand(command: ProviderComposerCommand): string {
  return `${command.trigger}${command.name}${command.trailingText}`;
}

const SUBMIT_ON_ENTER_COMMANDS = new Set(["clear", "compact"]);

export function commandSuggestionSubmitsOnEnter(suggestion: {
  name: string;
  source: ProviderCommandSource;
  origin: ProviderCommandOrigin;
}): boolean {
  return (
    suggestion.source === "command" &&
    suggestion.origin === "builtin" &&
    SUBMIT_ON_ENTER_COMMANDS.has(suggestion.name)
  );
}
