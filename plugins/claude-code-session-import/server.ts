import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { registerClaudeSessionImportCli } from "./src/cli.js";
import { claudeSessionImportRpcContract } from "./src/rpc-contract.js";
import {
  CLAUDE_CODE_PROVIDER_ID,
  createClaudeSessionImportService,
  SessionImportError,
} from "./src/service.js";

export default function plugin(bb: BbPluginApi) {
  const sessionImport = createClaudeSessionImportService(bb);
  registerClaudeSessionImportCli(bb, sessionImport);
  const rememberSessions = ({ thread }: { thread: { providerId: string } }) => {
    if (thread.providerId !== CLAUDE_CODE_PROVIDER_ID) return;
    void sessionImport.recordHeldProviderSessions().catch((error: unknown) => {
      bb.log.debug(
        `could not record held Claude Code sessions: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  };
  bb.events.on("thread.active", rememberSessions);
  bb.events.on("thread.idle", rememberSessions);
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
}
