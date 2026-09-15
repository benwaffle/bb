import { Command } from "commander";
import type { TimelineWorkflowWorkRow } from "@bb/server-contract";
import { action } from "../../action.js";
import { createCliBbSdk } from "../../client.js";
import { columnWidths, printBorderlessTable } from "../../table.js";
import { outputJson, requireThreadIdOrSelf } from "../helpers.js";

interface ThreadCommandsOptions {
  json?: boolean;
  self?: boolean;
}

function formatRunningFor(row: TimelineWorkflowWorkRow, now: number): string {
  const seconds = Math.max(0, Math.round((now - row.startedAt) / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return minutes < 60
    ? `${minutes}m ${seconds % 60}s`
    : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function registerCommandsCommands(
  parent: Command,
  getUrl: () => string,
): void {
  const commands = parent
    .command("commands [id]")
    .description(
      "List the background commands still running in a thread, with their task ids and command lines",
    )
    .option("--self", "Target the current thread (from BB_THREAD_ID)")
    .option("--json", "Print machine-readable JSON output")
    .action(
      action(async (id: string | undefined, opts: ThreadCommandsOptions) => {
        const threadId = requireThreadIdOrSelf(id, opts);
        const sdk = createCliBbSdk(getUrl());
        const { commands: rows } = await sdk.threads.backgroundCommands({
          threadId,
        });
        if (outputJson(opts, { threadId, commands: rows })) return;
        if (rows.length === 0) {
          console.log(`Thread ${threadId} has no running background commands`);
          return;
        }
        const now = Date.now();
        const tableRows = rows.map((row) => [
          row.familyId ?? row.itemId,
          formatRunningFor(row, now),
          row.command ?? row.description,
        ]);
        printBorderlessTable(
          {
            head: ["Task", "Running", "Command"],
            colWidths: columnWidths(
              [["Task", "Running", "Command"], ...tableRows],
              [12, 10, 40],
            ),
          },
          tableRows,
        );
      }),
    );

  commands
    .command("stop <taskId> [id]")
    .description(
      "Stop a running background command by task id; the agent is notified that it was stopped",
    )
    .option("--self", "Target the current thread (from BB_THREAD_ID)")
    .option("--json", "Print machine-readable JSON output")
    .action(
      action(
        async (
          taskId: string,
          id: string | undefined,
          opts: ThreadCommandsOptions,
        ) => {
          const threadId = requireThreadIdOrSelf(id, opts);
          const sdk = createCliBbSdk(getUrl());
          const result = await sdk.threads.stopBackgroundCommand({
            threadId,
            taskId,
          });
          if (outputJson(opts, { threadId, taskId, ...result })) return;
          console.log(`Stopped background command ${taskId} in thread ${threadId}`);
        },
      ),
    );
}
