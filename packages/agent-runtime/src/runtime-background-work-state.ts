import {
  backgroundTaskItemStatus,
  isSettledBackgroundTaskStatus,
  threadScope,
  type ThreadEvent,
  type ThreadEventBackgroundTaskItem,
  type ThreadEventDelegationItem,
} from "@bb/domain";

interface OpenBackgroundTask {
  kind: "backgroundTask";
  item: ThreadEventBackgroundTaskItem;
  providerThreadId: string;
}

interface OpenBackgroundDelegation {
  kind: "delegation";
  item: ThreadEventDelegationItem;
  providerThreadId: string;
}

type OpenBackgroundWork = OpenBackgroundTask | OpenBackgroundDelegation | null;

function stoppedBackgroundTaskItem(
  item: ThreadEventBackgroundTaskItem,
): ThreadEventBackgroundTaskItem {
  if (isSettledBackgroundTaskStatus(item.taskStatus)) {
    return { ...item, status: backgroundTaskItemStatus(item.taskStatus) };
  }
  return {
    ...item,
    ownerStopped: true,
    status: backgroundTaskItemStatus("stopped"),
    taskStatus: "stopped",
  };
}

export interface RuntimeOpenBackgroundWork {
  itemIds: string[];
  threadId: string;
}

export class RuntimeBackgroundWorkState {
  private readonly openWorkByThreadId = new Map<
    string,
    Map<string, OpenBackgroundWork>
  >();

  clearThread(threadId: string): void {
    this.openWorkByThreadId.delete(threadId);
  }

  hasOpenWork(): boolean {
    return this.openWorkByThreadId.size > 0;
  }

  listOpenWork(): RuntimeOpenBackgroundWork[] {
    return [...this.openWorkByThreadId].map(([threadId, openWork]) => ({
      threadId,
      itemIds: [...openWork.keys()],
    }));
  }

  hasOpenThreadWork(threadId: string): boolean {
    return (this.openWorkByThreadId.get(threadId)?.size ?? 0) > 0;
  }

  settleThread(threadId: string): ThreadEvent[] {
    const openWork = this.openWorkByThreadId.get(threadId);
    this.openWorkByThreadId.delete(threadId);
    if (!openWork) {
      return [];
    }
    return [...openWork.values()].flatMap((work): ThreadEvent[] => {
      if (work === null) {
        return [];
      }
      if (work.kind === "delegation") {
        return [
          {
            type: "item/delegation/completed",
            threadId,
            providerThreadId: work.providerThreadId,
            scope: threadScope(),
            item: { ...work.item, status: "interrupted" },
          },
        ];
      }
      return [
        {
          type: "item/backgroundTask/completed",
          threadId,
          providerThreadId: work.providerThreadId,
          scope: threadScope(),
          item: stoppedBackgroundTaskItem(work.item),
        },
      ];
    });
  }

  settleAll(): ThreadEvent[] {
    return [...this.openWorkByThreadId.keys()].flatMap((threadId) =>
      this.settleThread(threadId),
    );
  }

  observe(event: ThreadEvent): void {
    if (event.type === "item/started" || event.type === "item/completed") {
      if (event.item.type === "backgroundTask") {
        this.setBackgroundTask(event.threadId, {
          kind: "backgroundTask",
          item: event.item,
          providerThreadId: event.providerThreadId,
        });
      } else if (event.item.type === "delegation") {
        this.setDelegation(event.threadId, event.providerThreadId, event.item);
      }
      return;
    }

    if (
      event.type === "item/backgroundTask/progress" ||
      event.type === "item/backgroundTask/completed"
    ) {
      this.setBackgroundTask(event.threadId, {
        kind: "backgroundTask",
        item: event.item,
        providerThreadId: event.providerThreadId,
      });
      return;
    }

    if (
      event.type === "item/delegation/progress" ||
      event.type === "item/delegation/completed"
    ) {
      this.setDelegation(event.threadId, event.providerThreadId, event.item);
    }
  }

  private setDelegation(
    threadId: string,
    providerThreadId: string,
    item: ThreadEventDelegationItem,
  ): void {
    this.setWork({
      isOpen: item.status === "pending",
      taskId: item.id,
      threadId,
      work: item.background
        ? { kind: "delegation", item, providerThreadId }
        : null,
    });
  }

  private setBackgroundTask(threadId: string, task: OpenBackgroundTask): void {
    this.setWork({
      isOpen: task.item.status === "pending",
      taskId: task.item.id,
      threadId,
      work: task,
    });
  }

  private setWork(args: {
    isOpen: boolean;
    taskId: string;
    threadId: string;
    work: OpenBackgroundWork;
  }): void {
    const openWork = this.openWorkByThreadId.get(args.threadId);
    if (!args.isOpen) {
      if (!openWork) {
        return;
      }
      openWork.delete(args.taskId);
      if (openWork.size === 0) {
        this.openWorkByThreadId.delete(args.threadId);
      }
      return;
    }

    if (openWork) {
      openWork.set(args.taskId, args.work);
      return;
    }
    this.openWorkByThreadId.set(
      args.threadId,
      new Map([[args.taskId, args.work]]),
    );
  }
}
