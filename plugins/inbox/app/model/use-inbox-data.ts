import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  experimental_useRpcQuery,
  experimental_useSidebarThreadGroups,
  experimental_useSidebarThreads,
  useRealtime,
  type PluginSidebarProject,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import {
  inboxRpcContract,
  MAX_PENDING_KIND_THREADS,
  PROJECT_ICONS_CHANGED_CHANNEL,
  type PendingInteractionKind,
} from "../../shared/contract.js";
import {
  advanceGrace,
  EMPTY_GRACE_STATE,
  nextGraceExpiry,
  sameGraceState,
  type GraceObservation,
  type GraceState,
} from "./grace.js";
import { nextSnoozeWake, type InboxThreadStates } from "../../shared/inbox-state.js";
import {
  buildInboxEntries,
  buildInboxLayout,
  parkedPlacements,
  type InboxLayout,
} from "./layout.js";
import { deriveInboxStatus } from "./status.js";

const NO_KINDS: Readonly<Record<string, PendingInteractionKind>> = {};
const NO_ICONS: Readonly<Record<string, string | null>> = {};
const NO_STATES: InboxThreadStates = {};
const MAX_TIMER_MS = 2_147_483_647;

export function useThreadStates(): InboxThreadStates {
  const { data } = experimental_useRpcQuery({
    contract: inboxRpcContract,
    method: "threadStates",
    input: null,
  });
  return data?.states ?? NO_STATES;
}

function useWakeClock(states: InboxThreadStates): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const next = nextSnoozeWake(states, now);
    if (next === null) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, next - Date.now()) + 20, MAX_TIMER_MS),
    );
    return () => clearTimeout(timer);
  }, [states, now]);
  return now;
}

function usePendingInteractionKinds(
  threads: readonly PluginSidebarThread[],
): Readonly<Record<string, PendingInteractionKind>> {
  const key = threads
    .filter((thread) => thread.hasPendingInteraction && !thread.isArchived)
    .map((thread) => thread.id)
    .sort()
    .slice(0, MAX_PENDING_KIND_THREADS)
    .join(" ");
  const threadIds = useMemo(() => (key === "" ? [] : key.split(" ")), [key]);
  const { data } = experimental_useRpcQuery({
    contract: inboxRpcContract,
    method: "pendingInteractionKinds",
    input: { threadIds },
    enabled: threadIds.length > 0,
  });
  return threadIds.length === 0 ? NO_KINDS : (data?.kinds ?? NO_KINDS);
}

function useGrace(observations: readonly GraceObservation[]): GraceState {
  const [grace, setGrace] = useState<GraceState>(EMPTY_GRACE_STATE);
  const [tick, setTick] = useState(0);
  useLayoutEffect(() => {
    setGrace((previous) => {
      const next = advanceGrace(previous, observations, Date.now());
      return sameGraceState(previous, next) ? previous : next;
    });
  }, [observations, tick]);
  useEffect(() => {
    const expiry = nextGraceExpiry(grace);
    if (expiry === null) return;
    const timer = setTimeout(
      () => setTick((value) => value + 1),
      Math.max(0, expiry - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [grace]);
  return grace;
}

export function useProjectIcons(): Readonly<Record<string, string | null>> {
  const { data, refetch } = experimental_useRpcQuery({
    contract: inboxRpcContract,
    method: "projectIcons",
    input: null,
  });
  useRealtime(PROJECT_ICONS_CHANGED_CHANNEL, () => {
    void refetch();
  });
  return data?.icons ?? NO_ICONS;
}

export interface InboxData {
  status: "loading" | "ready" | "error";
  layout: InboxLayout;
  projectsById: ReadonlyMap<string, PluginSidebarProject>;
  threadsById: ReadonlyMap<string, PluginSidebarThread>;
}

export function useInboxData(): InboxData {
  const state = experimental_useSidebarThreads();
  const groups = experimental_useSidebarThreadGroups();
  const pendingKinds = usePendingInteractionKinds(state.threads);
  const threadStates = useThreadStates();
  const now = useWakeClock(threadStates);
  const observations = useMemo(() => {
    const placements = parkedPlacements(
      state.threads,
      pendingKinds,
      threadStates,
      now,
    );
    return state.threads
      .filter((thread) => !thread.isHidden && !thread.isArchived)
      .map((thread) => {
        const placement = placements.get(thread.id);
        return {
          id: thread.id,
          status: deriveInboxStatus(thread, pendingKinds[thread.id] ?? null),
          isPinned:
            thread.isPinned || placement === "settled" || placement === "snoozed",
        };
      });
  }, [state.threads, pendingKinds, threadStates, now]);
  const grace = useGrace(observations);
  const layout = useMemo(
    () =>
      buildInboxLayout(
        buildInboxEntries(state.threads, pendingKinds, grace, threadStates, now),
        groups,
      ),
    [state.threads, pendingKinds, grace, groups, threadStates, now],
  );
  const projectsById = useMemo(
    () => new Map(state.projects.map((project) => [project.id, project])),
    [state.projects],
  );
  const threadsById = useMemo(
    () => new Map(state.threads.map((thread) => [thread.id, thread])),
    [state.threads],
  );
  return { status: state.status, layout, projectsById, threadsById };
}
