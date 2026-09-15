import { experimental_defineHostEntry } from "@get-bb/plugin-sdk/host";
import { claudeSessionImportHostContract } from "./src/host-contract.js";
import {
  listClaudeSessions,
  readClaudeSessionTurns,
} from "./src/session-import.js";

export default experimental_defineHostEntry({
  contract: claudeSessionImportHostContract,
  handlers: {
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
