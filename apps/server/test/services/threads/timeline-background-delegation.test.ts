import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getThread } from "@bb/db";
import type { Thread } from "@bb/domain";
import {
  isThreadTimelineDelta,
  type ThreadTimelineResponse,
  type TimelineRow,
} from "@bb/server-contract";
import { createThreadTimelineWindows } from "../../../src/services/threads/thread-timeline-windows.js";
import {
  createTestAppHarness,
  type TestAppHarness,
} from "../../helpers/test-app.js";
import {
  PROVIDER_THREAD_ID,
  appendRows,
  withTestThread,
  type RowSpec,
} from "../../helpers/timeline-cache-fixture.js";

let harness: TestAppHarness;

beforeAll(async () => {
  harness = await createTestAppHarness();
});

afterAll(async () => {
  await harness.cleanup();
});

const DELEGATION_ID = "delegation-bg";

function delegationItem(status: string) {
  return {
    type: "delegation",
    id: DELEGATION_ID,
    childRef: "toolu_bg",
    label: "Survey the build",
    status,
    background: true,
  };
}

function childMessage(id: string, text: string): RowSpec {
  return {
    type: "item/completed",
    turnId: "turn-1",
    itemId: id,
    itemKind: "agentMessage",
    parentToolCallId: DELEGATION_ID,
    data: {
      item: {
        type: "agentMessage",
        id,
        text,
        parentToolCallId: DELEGATION_ID,
      },
    },
  };
}

type DelegationRow = Extract<
  TimelineRow,
  { kind: "work"; workKind: "delegation" }
>;

function findDelegation(
  rows: readonly TimelineRow[],
): DelegationRow | undefined {
  for (const row of rows) {
    if (row.kind === "work" && row.workKind === "delegation") {
      return row;
    }
    if (row.kind === "turn" && row.children !== null) {
      const nested = findDelegation(row.children);
      if (nested) return nested;
    }
  }
  return undefined;
}

describe("background subagent delegation rows", () => {
  it("stream child rows inline while running and defer them once the background task settles", () => {
    withTestThread((testThread) => {
      const { db, thread } = testThread;
      const windows = createThreadTimelineWindows({ ...harness.deps, db });
      const read = (): ThreadTimelineResponse => {
        const response = windows.read(
          getThread(db, thread.id) as Thread,
          {
            deferContent: true,
            includeNestedRows: false,
            page: { kind: "latest", segmentLimit: 20 },
          },
          undefined,
        );
        if (isThreadTimelineDelta(response)) {
          throw new Error("expected a full window");
        }
        return response;
      };
      const childTexts = (row: DelegationRow | undefined) =>
        (row?.childRows ?? []).flatMap((child) =>
          child.kind === "conversation" ? [child.text] : [],
        );

      appendRows(testThread, [
        { type: "turn/started", turnId: "turn-1" },
        {
          type: "item/started",
          turnId: "turn-1",
          itemId: DELEGATION_ID,
          itemKind: "delegation",
          data: { item: delegationItem("pending") },
        },
        childMessage("child-1", "Reading turbo.json now."),
      ]);
      const first = findDelegation(read().rows);
      expect(first).toMatchObject({ status: "pending" });
      expect(childTexts(first)).toEqual(["Reading turbo.json now."]);

      appendRows(testThread, [
        childMessage("child-2", "The pipeline is turbo then electron-builder."),
      ]);
      expect(childTexts(findDelegation(read().rows))).toEqual([
        "Reading turbo.json now.",
        "The pipeline is turbo then electron-builder.",
      ]);

      appendRows(testThread, [
        {
          type: "item/delegation/completed",
          providerThreadId: PROVIDER_THREAD_ID,
          itemId: DELEGATION_ID,
          itemKind: "delegation",
          data: {
            providerThreadId: PROVIDER_THREAD_ID,
            item: {
              ...delegationItem("completed"),
              summary: "The pipeline is turbo then electron-builder.",
            },
          },
        },
      ]);
      expect(findDelegation(read().rows)).toMatchObject({
        status: "completed",
        childRows: null,
        output: "The pipeline is turbo then electron-builder.",
      });
    });
  });
});
