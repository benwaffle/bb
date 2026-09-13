import os from "node:os";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import {
  experimental_defineHostEntry,
  experimental_nativeRootsHostContract,
} from "@get-bb/plugin-sdk/host";
import { resolveClaudeNativeRoots } from "./native-roots.js";
import { claudeSessionImportHostContract } from "./session-import-contract.js";
import { listClaudeSessions, readClaudeSessionTurns } from "./session-import.js";

export { experimental_providerBridge } from "./bridge/bridge.js";

export const claudeCodeHostContract = defineRpcContract({
  ...experimental_nativeRootsHostContract,
  ...claudeSessionImportHostContract,
});

export default experimental_defineHostEntry({
  contract: claudeCodeHostContract,
  handlers: {
    resolveNativeRoots: (input) =>
      resolveClaudeNativeRoots({
        cwd: input.cwd,
        homeDir: os.homedir(),
        env: process.env,
      }),
    listClaudeSessions: (input) => ({
      sessions: listClaudeSessions(
        input.dir === undefined ? {} : { dir: input.dir },
      ),
    }),
    readClaudeSessionTurns: (input) =>
      readClaudeSessionTurns({
        session: input.session,
        ...(input.turns === undefined ? {} : { turns: input.turns }),
        entropyPrefix: input.entropyPrefix,
      }),
  },
});
