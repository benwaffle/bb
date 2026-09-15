import { BRIDGE_NOTIFICATION_METHODS } from "../notifications.js";

interface ReportProviderChildProcessArgs {
  child: { pid?: number | undefined };
  threadId: string | null;
  write?: (line: string) => void;
}

export function experimental_reportProviderChildProcess(
  args: ReportProviderChildProcessArgs,
): void {
  if (args.threadId === null || args.child.pid === undefined) {
    return;
  }
  const write = args.write ?? ((line: string) => process.stdout.write(line));
  write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      method: BRIDGE_NOTIFICATION_METHODS.threadProcess,
      params: { threadId: args.threadId, pid: args.child.pid },
    })}\n`,
  );
}
