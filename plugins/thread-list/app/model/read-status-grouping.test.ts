import { afterEach, describe, expect, it } from "vitest";
import { makeSidebarThread, type SidebarThreadOverrides } from "./fixtures.js";
import {
  buildSectionThreadList,
  compareStandardThreads,
  type ThreadComparator,
} from "./project-thread-groups.js";
import {
  createThreadUnreadPredicate,
  groupComparatorByReadStatus,
  rememberHeldReadStatus,
  resolveHeldReadStatus,
  restoreHeldReadStatus,
  threadSortSignature,
} from "./read-status-grouping.js";

const read = { lastReadAt: 10_000 };

function thread(id: string, overrides: SidebarThreadOverrides = {}) {
  return makeSidebarThread({
    id,
    title: id,
    latestAttentionAt: 5,
    ...overrides,
  });
}

describe("createThreadUnreadPredicate", () => {
  it("counts only threads that show an unread dot", () => {
    const isUnread = createThreadUnreadPredicate(null);

    expect(isUnread(thread("root"))).toBe(true);
    expect(isUnread(thread("error", { status: "error" }))).toBe(true);
    expect(isUnread(thread("read", read))).toBe(false);
    expect(isUnread(thread("child", { parentThreadId: "root" }))).toBe(false);
    expect(isUnread(thread("running", { status: "active" }))).toBe(false);
  });
});

describe("groupComparatorByReadStatus", () => {
  it("lists unread threads first and keeps the base order in each group", () => {
    const threads = [
      thread("read-new", { latestAttentionAt: 400, ...read }),
      thread("unread-new", { latestAttentionAt: 300 }),
      thread("read-old", { latestAttentionAt: 200, ...read }),
      thread("unread-old", { latestAttentionAt: 100 }),
    ];
    const compare = groupComparatorByReadStatus(
      compareStandardThreads,
      createThreadUnreadPredicate(null),
    );

    expect(threads.sort(compare).map(({ id }) => id)).toEqual([
      "unread-new",
      "unread-old",
      "read-new",
      "read-old",
    ]);
  });

  it("applies read status before an item comparator", () => {
    const byTitleDescending = ((left, right) =>
      right.displayTitle.localeCompare(left.displayTitle)) as ThreadComparator;
    byTitleDescending.compareItems = (left, right) =>
      left.kind === "thread" && right.kind === "thread"
        ? byTitleDescending(left.node.thread, right.node.thread)
        : 0;
    const items = buildSectionThreadList(
      [thread("alpha"), thread("zulu", read)],
      groupComparatorByReadStatus(
        byTitleDescending,
        createThreadUnreadPredicate(null),
      ),
    );

    expect(
      items.map((item) => (item.kind === "thread" ? item.node.thread.id : "")),
    ).toEqual(["alpha", "zulu"]);
  });
});

describe("resolveHeldReadStatus", () => {
  afterEach(() => rememberHeldReadStatus(null));

  function orderWith(
    held: ReturnType<typeof resolveHeldReadStatus>,
    threads: Parameters<typeof resolveHeldReadStatus>[1],
  ) {
    return buildSectionThreadList(
      threads,
      groupComparatorByReadStatus(
        compareStandardThreads,
        createThreadUnreadPredicate(held),
      ),
    ).map((item) => (item.kind === "thread" ? item.node.thread.id : ""));
  }

  it("keeps the order when the user opens threads", () => {
    const initial = [
      thread("first", { latestAttentionAt: 300 }),
      thread("second", { latestAttentionAt: 200 }),
      thread("read", { latestAttentionAt: 400, ...read }),
    ];
    const order = ["first", "second", "read"];
    expect(orderWith(null, initial)).toEqual(order);

    const openedFirst = resolveHeldReadStatus(null, initial, "first");
    const firstRead = [
      thread("first", { latestAttentionAt: 300, ...read }),
      initial[1],
      initial[2],
    ];
    const afterFirstRead = resolveHeldReadStatus(
      openedFirst,
      firstRead,
      "first",
    );
    expect(orderWith(afterFirstRead, firstRead)).toEqual(order);

    const openedSecond = resolveHeldReadStatus(
      afterFirstRead,
      firstRead,
      "second",
    );
    expect(orderWith(openedSecond, firstRead)).toEqual(order);

    const bothRead = [
      firstRead[0],
      thread("second", { latestAttentionAt: 200, ...read }),
      initial[2],
    ];
    const afterSecondRead = resolveHeldReadStatus(
      openedSecond,
      bothRead,
      "second",
    );
    expect(orderWith(afterSecondRead, bothRead)).toEqual(order);
    expect(
      orderWith(
        resolveHeldReadStatus(afterSecondRead, bothRead, "read"),
        bothRead,
      ),
    ).toEqual(order);
  });

  it("regroups opened threads when new activity re-sorts the list", () => {
    const threads = [
      thread("opened", { latestAttentionAt: 300, ...read }),
      thread("open", { latestAttentionAt: 200, ...read }),
      thread("idle", { latestAttentionAt: 100, ...read }),
    ];
    const opened = resolveHeldReadStatus(
      {
        selectedThreadId: "open",
        sortSignature: threadSortSignature(threads),
        isUnreadByThreadId: new Map([
          ["opened", true],
          ["open", true],
        ]),
      },
      threads,
      "open",
    );
    expect(orderWith(opened, threads)).toEqual(["opened", "open", "idle"]);

    const withNewMessage = [
      threads[0],
      threads[1],
      thread("idle", { latestAttentionAt: 500 }),
    ];
    const afterMessage = resolveHeldReadStatus(
      opened,
      withNewMessage,
      "open",
    );
    expect(orderWith(afterMessage, withNewMessage)).toEqual([
      "idle",
      "open",
      "opened",
    ]);
  });

  it("keeps the held status when the sidebar remounts", () => {
    rememberHeldReadStatus(
      resolveHeldReadStatus(null, [thread("remounted")], "remounted"),
    );

    const remounted = resolveHeldReadStatus(
      restoreHeldReadStatus("remounted"),
      [thread("remounted", read)],
      "remounted",
    );
    expect(
      createThreadUnreadPredicate(remounted)(thread("remounted", read)),
    ).toBe(true);
  });
});
