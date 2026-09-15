import { registerUsageSource } from "./src/usage-source.js";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { experimental_sessionCommandsStateSchema } from "@get-bb/plugin-sdk/provider-bridge";
import {
  CLAUDE_CODE_ACTIVE_CATALOG_DATA,
  CLAUDE_XHIGH_CAPABLE_REASONING_EFFORT_DATA,
  DEFAULT_CLAUDE_CODE_MODEL,
} from "./src/model-catalog-data.js";
import { CLAUDE_NATIVE_ROOTS_DECLARATION } from "./src/native-roots.js";
import { CLAUDE_SESSION_COMMANDS_EXTENSION_NAME } from "./src/session-commands.js";
import { registerClaudeSessionImportCli } from "./src/session-import-cli.js";
import { claudeSessionImportRpcContract } from "./src/session-import-rpc.js";
import {
  createClaudeSessionImportService,
  SessionImportError,
} from "./src/session-import-service.js";

export default function plugin(bb: BbPluginApi) {
  registerUsageSource(bb);
  const sessionImport = createClaudeSessionImportService(bb);
  registerClaudeSessionImportCli(bb, sessionImport);
  bb.rpc.register(claudeSessionImportRpcContract, {
    listSessions: (input) =>
      sessionImport.listSessions({
        machine: input.machine,
        dir: input.dir,
        signal: undefined,
      }),
    async importSession(input) {
      try {
        const result = await sessionImport.importSession({
          session: input.sessionId,
          machine: input.machine,
          projectId: input.projectId,
          environment: null,
          title: null,
          turns: null,
          fallbackProjectId: undefined,
          signal: undefined,
        });
        return {
          threadId: result.thread.id,
          title: result.thread.title,
          turnCount: result.session.turnCount,
        };
      } catch (error) {
        if (error instanceof SessionImportError) throw new Error(error.message);
        throw error;
      }
    },
  });
  bb.settings.define({
    memoryEnabled: {
      type: "boolean",
      label: "Claude Code memory",
      description:
        "Allow Claude Code to read and write its native auto-memory for bb threads.",
      default: true,
    },
    subagentsDisabled: {
      type: "boolean",
      label: "Disable provider subagents",
      description:
        "Hide Claude Code's native Task tool so agents use bb for delegation.",
      default: false,
    },
    workflowsDisabled: {
      type: "boolean",
      label: "Disable Workflow tool",
      description: "Hide Claude Code's native Workflow tool for bb threads.",
      default: false,
    },
    chromeEnabled: {
      type: "boolean",
      label: "Claude in Chrome",
      description:
        "Start Claude Code with the Claude in Chrome browser tools. Needs the Chrome extension and a claude.ai login on the host.",
      default: false,
    },
  });

  bb.providers.register({
    id: "claude-code",
    displayName: "Claude Code",
    icon: "./icons/claude-code.svg",
    strings: {
      signInHint: "Run `claude` on the machine to sign in.",
      expiredHint: "Your Claude session expired. Run `claude`, then reload.",
      installUrl: "https://claude.com/claude-code",
      brandPrefix: "Claude ",
      planModeCopy:
        "Claude Code will plan without normal full-access execution.",
      iconTint: { light: "#D97757", dark: "#D97757" },
    },
    ...CLAUDE_NATIVE_ROOTS_DECLARATION,
    extensionKinds: {
      [CLAUDE_SESSION_COMMANDS_EXTENSION_NAME]: {
        state: experimental_sessionCommandsStateSchema,
      },
    },
    experimental_sessionCommandsExtensionKind:
      CLAUDE_SESSION_COMMANDS_EXTENSION_NAME,
    maintenance: { health: true, usage: true, installation: true },
    capabilities: {
      supportsServiceTier: false,
      supportsNativeUserQuestion: true,
      fork: "checkpoint",
      supportsManualCompaction: true,
      supportsThreadArchive: false,
      supportsThreadRename: false,
      permissionModes: ["accept-edits", "auto", "full"],
      reasoningLevels: ["low", "medium", "high", "xhigh", "ultracode", "max"],
    },
    reasoningLevels: [
      { id: "low", label: "Low" },
      { id: "medium", label: "Medium" },
      { id: "high", label: "High" },
      { id: "xhigh", label: "Extra High" },
      {
        id: "ultracode",
        label: "Ultracode",
        description: "Extra-high effort plus standing workflow orchestration.",
      },
      { id: "max", label: "Max" },
    ],
    composerActions: ["plan"],
    completedTurnDisplay: "flat",
    env: { passthrough: ["BB_CLAUDE_CODE_EXECUTABLE"] },
    models: {
      scope: "host",
      fallback: CLAUDE_CODE_ACTIVE_CATALOG_DATA.map((entry) => ({
        id: entry.model,
        displayName: entry.displayName,
        description: entry.description,
        supportedReasoningEfforts: CLAUDE_XHIGH_CAPABLE_REASONING_EFFORT_DATA,
        defaultReasoningEffort: entry.defaultReasoningEffort,
        isDefault: entry.model === DEFAULT_CLAUDE_CODE_MODEL,
      })),
    },
    deriveProviderOptions(context) {
      return {
        memoryEnabled: context.settings.memoryEnabled !== false,
        providerSubagentsEnabled: context.settings.subagentsDisabled !== true,
        workflowsEnabled: context.settings.workflowsDisabled !== true,
        chromeEnabled: context.settings.chromeEnabled === true,
        ...(context.promptMode === "plan"
          ? { claudeCodePermissionMode: "plan" }
          : {}),
      };
    },
  });
}
