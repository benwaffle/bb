import {
  providerCommandSectionRank,
  type CommandListResponse,
  type ProviderCommand,
} from "@bb/server-contract";
import type { ProviderSessionCommand } from "@bb/domain";
import type { HostProviderCommand } from "@bb/host-daemon-contract";
import type { ProviderRegistration } from "../providers/provider-registry.js";
import type { ResolvedSkillCatalogEntry } from "../skills/injected-skills.js";

const BUILT_IN_PROVIDER_COMMANDS: ProviderCommand[] = [
  {
    name: "clear",
    source: "command",
    origin: "builtin",
    description: "Start fresh context in this thread",
    argumentHint: null,
  },
  {
    name: "compact",
    source: "command",
    origin: "builtin",
    description: "Compact context",
    argumentHint: null,
  },
];

function providerComposerHasSkillsAction(
  composerActions: readonly { kind: string }[],
): boolean {
  return composerActions.some((action) => action.kind === "skills");
}

export function providerHasCommandSurface(
  registration: ProviderRegistration,
): boolean {
  return providerComposerHasSkillsAction(registration.info.composerActions);
}

function toProviderCommand(command: HostProviderCommand): ProviderCommand {
  return {
    name: command.name,
    source: command.source,
    origin: command.origin,
    description: command.description,
    argumentHint: command.argumentHint,
  };
}

function toSkillCommand(entry: ResolvedSkillCatalogEntry): ProviderCommand {
  const { provenance, runtimeSource } = entry;
  return {
    name: runtimeSource.name,
    source: "skill",
    origin: provenance.kind === "project" ? "project" : "user",
    description: runtimeSource.description,
    argumentHint: null,
    ...(provenance.kind === "plugin" ? { pluginId: provenance.pluginId } : {}),
  };
}

function dedupeBySourceAndName(commands: ProviderCommand[]): ProviderCommand[] {
  const byKey = new Map<string, ProviderCommand>();
  for (const command of commands) {
    const key = `${command.source} ${command.name}`;
    const existing = byKey.get(key);
    if (!existing || commandOriginRank(command) > commandOriginRank(existing)) {
      byKey.set(key, command);
    }
  }
  return [...byKey.values()];
}

function commandOriginRank(command: ProviderCommand): number {
  switch (command.origin) {
    case "builtin":
      return 2;
    case "project":
      return 1;
    case "user":
      return 0;
  }
}

function compareCommands(a: ProviderCommand, b: ProviderCommand): number {
  const bySection =
    providerCommandSectionRank(a) - providerCommandSectionRank(b);
  if (bySection !== 0) {
    return bySection;
  }
  return a.name.localeCompare(b.name);
}

function sessionCommandsMissingFromCatalog(
  catalog: readonly ProviderCommand[],
  sessionCommands: readonly ProviderSessionCommand[],
): ProviderCommand[] {
  const knownNames = new Set(catalog.map((command) => command.name));
  const additions: ProviderCommand[] = [];
  for (const command of sessionCommands) {
    if (
      knownNames.has(command.name) ||
      command.aliases.some((alias) => knownNames.has(alias))
    ) {
      continue;
    }
    knownNames.add(command.name);
    additions.push({
      name: command.name,
      source: "skill",
      origin: "builtin",
      description: command.description,
      argumentHint: command.argumentHint,
    });
  }
  return additions;
}

interface BuildCommandListResponseArgs {
  commands: HostProviderCommand[];
  includeBuiltinCompact: boolean;
  skillCatalog: readonly ResolvedSkillCatalogEntry[];
  sessionCommands?: readonly ProviderSessionCommand[];
}

export function buildCommandListResponse(
  args: BuildCommandListResponseArgs,
): CommandListResponse {
  const catalog = dedupeBySourceAndName([
    ...BUILT_IN_PROVIDER_COMMANDS.filter(
      (command) => command.name !== "compact" || args.includeBuiltinCompact,
    ),
    ...args.skillCatalog.map(toSkillCommand),
    ...args.commands.map(toProviderCommand),
  ]);
  return {
    commands: [
      ...catalog,
      ...sessionCommandsMissingFromCatalog(catalog, args.sessionCommands ?? []),
    ].sort(compareCommands),
  };
}
