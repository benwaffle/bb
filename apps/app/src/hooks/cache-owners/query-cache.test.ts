import type { QueryKey } from "@tanstack/react-query";
import type {
  HostMemoryUsage,
  ThreadListEntry,
  ThreadMemoryUsage,
} from "@bb/domain";
import type { ThreadResponse } from "@bb/server-contract";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import { describe, expect, it } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { makeThreadResponse } from "@/test/fixtures/thread-responses";
import {
  ARCHIVED_THREADS_LIST_KIND,
  THREADS_QUERY_KEY,
  archivedThreadsListQueryKey,
  hostMemoryUsageQueryKey,
  threadListQueryKey,
  threadQueryKey,
} from "../queries/query-keys";
import {
  applyHostMemoryUsageSignal,
  getCachedGlobalThreadListInvalidationQueryKeys,
  getCachedProjectThreadListInvalidationQueryKeys,
} from "./query-cache";

describe("query cache thread list invalidation keys", () => {
  it("includes global archived lists in global invalidation", () => {
    const { queryClient } = createQueryClientTestHarness();
    const projectArchivedKey = archivedThreadsListQueryKey({
      projectId: "proj_1",
    });
    const globalArchivedKey = archivedThreadsListQueryKey({});
    const globalChildArchivedKey = archivedThreadsListQueryKey({
      kind: "child",
    });

    queryClient.setQueryData(projectArchivedKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(globalArchivedKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(globalChildArchivedKey, {
      pages: [],
      pageParams: [],
    });

    const queryKeys = getCachedGlobalThreadListInvalidationQueryKeys({
      queryClient,
    });

    expect(queryKeys).toContainEqual(globalArchivedKey);
    expect(queryKeys).toContainEqual(globalChildArchivedKey);
    expect(queryKeys).not.toContainEqual(projectArchivedKey);
  });

  it("excludes archived list keys with unsupported scope filters", () => {
    const { queryClient } = createQueryClientTestHarness();
    const sectionArchivedKey: QueryKey = [
      THREADS_QUERY_KEY,
      ARCHIVED_THREADS_LIST_KIND,
      { sectionId: "sec_work" },
    ];
    const unsectionedArchivedKey: QueryKey = [
      THREADS_QUERY_KEY,
      ARCHIVED_THREADS_LIST_KIND,
      { unsectioned: true },
    ];

    queryClient.setQueryData(sectionArchivedKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(unsectionedArchivedKey, {
      pages: [],
      pageParams: [],
    });

    const queryKeys = getCachedGlobalThreadListInvalidationQueryKeys({
      queryClient,
    });

    expect(queryKeys).not.toContainEqual(sectionArchivedKey);
    expect(queryKeys).not.toContainEqual(unsectionedArchivedKey);
  });

  it("includes archived project lists in project invalidation", () => {
    const { queryClient } = createQueryClientTestHarness();
    const projectArchivedKey = archivedThreadsListQueryKey({
      projectId: "proj_1",
    });
    const projectThreadListKey = threadListQueryKey({
      archived: false,
      projectId: "proj_1",
    });
    const otherProjectArchivedKey = archivedThreadsListQueryKey({
      projectId: "proj_2",
    });

    queryClient.setQueryData(projectArchivedKey, { pages: [], pageParams: [] });
    queryClient.setQueryData(projectThreadListKey, []);
    queryClient.setQueryData(otherProjectArchivedKey, {
      pages: [],
      pageParams: [],
    });

    const queryKeys = getCachedProjectThreadListInvalidationQueryKeys({
      projectId: "proj_1",
      queryClient,
    });

    expect(queryKeys).toContainEqual(projectArchivedKey);
    expect(queryKeys).toContainEqual(projectThreadListKey);
    expect(queryKeys).not.toContainEqual(otherProjectArchivedKey);
  });
});

describe("applyHostMemoryUsageSignal", () => {
  const usage = (rssBytes: number): ThreadMemoryUsage => ({
    rssBytes,
    processCount: 3,
    sharedThreadCount: 1,
    sampledAt: 1_700_000_000_000,
  });

  it("patches host threads in cached lists and details, and leaves other hosts alone", () => {
    const { queryClient } = createQueryClientTestHarness();
    const listKey = threadListQueryKey({ archived: false, projectId: "proj_1" });
    const onHost = makeThreadListEntry({
      id: "thr_on_host",
      environmentHostId: "host_1",
      memoryUsage: usage(10),
    });
    const leftHost = makeThreadListEntry({
      id: "thr_left_host",
      environmentHostId: "host_1",
      memoryUsage: usage(20),
    });
    const elsewhere = makeThreadListEntry({
      id: "thr_elsewhere",
      environmentHostId: "host_2",
      memoryUsage: usage(30),
    });
    queryClient.setQueryData(listKey, [onHost, leftHost, elsewhere]);
    queryClient.setQueryData(
      threadQueryKey("thr_on_host"),
      makeThreadResponse({ id: "thr_on_host", memoryUsage: usage(10) }),
    );
    queryClient.setQueryData(
      threadQueryKey("thr_left_host"),
      makeThreadResponse({ id: "thr_left_host", memoryUsage: usage(20) }),
    );

    applyHostMemoryUsageSignal(queryClient, {
      type: "host-memory-usage",
      hostId: "host_1",
      host: { rssBytes: 99, processCount: 4, sampledAt: 1_700_000_005_000 },
      threads: { thr_on_host: usage(99) },
    });

    const list = queryClient.getQueryData<ThreadListEntry[]>(listKey)!;
    expect(list.map((thread) => thread.memoryUsage?.rssBytes ?? null)).toEqual(
      [99, null, 30],
    );
    expect(
      queryClient.getQueryData<ThreadResponse>(threadQueryKey("thr_on_host"))
        ?.memoryUsage?.rssBytes,
    ).toBe(99);
    expect(
      queryClient.getQueryData<ThreadResponse>(threadQueryKey("thr_left_host"))
        ?.memoryUsage,
    ).toBeNull();
    expect(
      queryClient.getQueryData<HostMemoryUsage | null>(
        hostMemoryUsageQueryKey("host_1"),
      ),
    ).toEqual({ rssBytes: 99, processCount: 4, sampledAt: 1_700_000_005_000 });
  });

  it("keeps list identity when nothing changed for the host", () => {
    const { queryClient } = createQueryClientTestHarness();
    const listKey = threadListQueryKey({ archived: false, projectId: "proj_1" });
    const entries = [
      makeThreadListEntry({
        id: "thr_same",
        environmentHostId: "host_1",
        memoryUsage: usage(10),
      }),
    ];
    queryClient.setQueryData(listKey, entries);

    applyHostMemoryUsageSignal(queryClient, {
      type: "host-memory-usage",
      hostId: "host_1",
      host: { rssBytes: 10, processCount: 3, sampledAt: 1_700_000_000_000 },
      threads: { thr_same: usage(10) },
    });

    expect(queryClient.getQueryData(listKey)).toBe(entries);
  });
});
