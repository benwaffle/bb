import {
  type DeltaDelegationShape,
  type DeltaPresentation,
  type ThreadDelta,
  backgroundTaskItemStatus,
  toOptionalRecord,
} from "@get-bb/plugin-sdk/provider-bridge";
import { LAUNCHED_SUBAGENT_LABEL } from "./presentation.js";
import {
  findClaudeAgentTaskForToolUse,
  type ClaudeTaskMap,
} from "./task-translation.js";
import { stripClaudeAgentOutputMetadata } from "./tool-classification.js";

interface ClaudeBackgroundDelegation {
  toolUseId: string;
  parentRef: string | undefined;
  shape: DeltaDelegationShape;
  presentation: DeltaPresentation | undefined;
  lastMessage: string | undefined;
}

export type ClaudeBackgroundDelegationMap = Map<
  string,
  ClaudeBackgroundDelegation
>;

type DelegationCloseStatus = "completed" | "failed" | "interrupted";

const ASYNC_AGENT_LAUNCH_TEXT_PREFIX = "Async agent launched";

function isAsyncLaunchToolUseResult(toolUseResult: unknown): boolean {
  const record = toOptionalRecord(toolUseResult);
  return record?.status === "async_launched" || record?.isAsync === true;
}

export function isClaudeAsyncAgentLaunch(args: {
  toolUseResults: readonly unknown[];
  outputText: string | undefined;
}): boolean {
  return (
    args.toolUseResults.some(isAsyncLaunchToolUseResult) ||
    args.outputText?.trimStart().startsWith(ASYNC_AGENT_LAUNCH_TEXT_PREFIX) ===
      true
  );
}

function delegationKey(delegation: ClaudeBackgroundDelegation): {
  providerItemId: string;
  parentRef?: string;
} {
  return {
    providerItemId: delegation.toolUseId,
    ...(delegation.parentRef === undefined
      ? {}
      : { parentRef: delegation.parentRef }),
  };
}

function closeDelegationDelta(
  delegation: ClaudeBackgroundDelegation,
  status: DelegationCloseStatus,
  summary: string | undefined,
): ThreadDelta {
  const trimmed =
    summary === undefined ? "" : stripClaudeAgentOutputMetadata(summary);
  return {
    kind: "item.close",
    key: delegationKey(delegation),
    status,
    item: {
      ...delegation.shape,
      ...(trimmed.length > 0 ? { summary: trimmed } : {}),
    },
    ...(delegation.presentation === undefined
      ? {}
      : { presentation: delegation.presentation }),
  };
}

export function launchClaudeBackgroundDelegation(args: {
  delegations: ClaudeBackgroundDelegationMap;
  tasks: ClaudeTaskMap;
  toolUseId: string;
  parentRef: string | undefined;
  shape: DeltaDelegationShape;
  presentation: DeltaPresentation | undefined;
  launchText: string | undefined;
}): ThreadDelta[] {
  const shape: DeltaDelegationShape = { ...args.shape, background: true };
  const task = findClaudeAgentTaskForToolUse(args.tasks, args.toolUseId);
  const delegation: ClaudeBackgroundDelegation = {
    toolUseId: args.toolUseId,
    parentRef: args.parentRef,
    shape,
    presentation: args.presentation,
    lastMessage: undefined,
  };
  if (task === undefined || task.terminal) {
    return [
      closeDelegationDelta(
        {
          ...delegation,
          ...(args.presentation === undefined
            ? {}
            : {
                presentation: {
                  ...args.presentation,
                  label: LAUNCHED_SUBAGENT_LABEL,
                },
              }),
        },
        "completed",
        args.launchText,
      ),
    ];
  }
  args.delegations.set(args.toolUseId, delegation);
  if (args.shape.background) {
    return [];
  }
  return [
    {
      kind: "item.progress",
      key: delegationKey(delegation),
      snapshot: shape,
      flush: true,
    },
  ];
}

export function noteClaudeBackgroundDelegationMessage(args: {
  delegations: ClaudeBackgroundDelegationMap;
  parentToolCallId: string | undefined;
  text: string;
}): void {
  if (args.parentToolCallId === undefined) {
    return;
  }
  const delegation = args.delegations.get(args.parentToolCallId);
  if (delegation !== undefined && args.text.trim().length > 0) {
    delegation.lastMessage = args.text;
  }
}

export function settleFinishedClaudeBackgroundDelegations(args: {
  delegations: ClaudeBackgroundDelegationMap;
  tasks: ClaudeTaskMap;
}): ThreadDelta[] {
  const deltas: ThreadDelta[] = [];
  for (const delegation of [...args.delegations.values()]) {
    const task = findClaudeAgentTaskForToolUse(
      args.tasks,
      delegation.toolUseId,
    );
    if (task !== undefined && !task.terminal) {
      continue;
    }
    args.delegations.delete(delegation.toolUseId);
    const itemStatus =
      task === undefined
        ? "interrupted"
        : backgroundTaskItemStatus(task.taskStatus);
    deltas.push(
      closeDelegationDelta(
        delegation,
        itemStatus === "pending" ? "interrupted" : itemStatus,
        delegation.lastMessage ?? task?.summary,
      ),
    );
  }
  return deltas;
}
