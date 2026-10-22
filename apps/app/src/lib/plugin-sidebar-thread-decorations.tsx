import { memo, useEffect, useSyncExternalStore } from "react";
import type {
  ExperimentalResolvedSidebarThreadDecoration,
  ExperimentalResolvedSidebarThreadRowDecoration,
  ExperimentalSidebarThreadDecoration,
  ExperimentalSidebarThreadRowDecoration,
} from "@get-bb/plugin-sdk";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import {
  usePluginSlots,
  type ExperimentalSidebarThreadDecorationSlot,
} from "./plugin-slots";
import {
  parseHttpUrl,
  parseRowIcon,
  parseRowPullRequest,
  parseRowTrailing,
} from "./plugin-sidebar-thread-groups";

const SLOT_KIND = "sidebarThreadDecorations";

interface ThreadRowTarget {
  threadId: string;
  projectId: string;
}

function createDecorationStore<Target, Decoration>(
  keyOf: (target: Target) => string,
) {
  const requests = new Map<string, { target: Target; count: number }>();
  const requestListeners = new Set<() => void>();
  const noTargets: readonly Target[] = [];
  let requested: readonly Target[] = noTargets;
  const published = new Map<string, Map<string, Decoration>>();
  const resolved = new Map<string, Decoration>();
  const listeners = new Set<() => void>();

  function setRequested(): void {
    requested =
      requests.size === 0
        ? noTargets
        : [...requests.values()].map((request) => request.target);
    for (const listener of requestListeners) listener();
  }

  function resolve(key: string): void {
    const sources = published.get(key);
    const firstSource = [...(sources?.keys() ?? [])].sort()[0];
    const first =
      firstSource === undefined ? undefined : sources?.get(firstSource);
    if (first === undefined) resolved.delete(key);
    else resolved.set(key, first);
    for (const listener of listeners) listener();
  }

  return {
    request(target: Target): () => void {
      const key = keyOf(target);
      const existing = requests.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        requests.set(key, { target, count: 1 });
        setRequested();
      }
      return () => {
        const current = requests.get(key);
        if (!current) return;
        current.count -= 1;
        if (current.count > 0) return;
        requests.delete(key);
        setRequested();
      };
    },
    publish(source: string, target: Target, decoration: Decoration | null) {
      if (decoration === null) return () => undefined;
      const key = keyOf(target);
      let sources = published.get(key);
      if (!sources) {
        sources = new Map();
        published.set(key, sources);
      }
      sources.set(source, decoration);
      resolve(key);
      return () => {
        const current = published.get(key);
        if (current?.get(source) !== decoration) return;
        current.delete(source);
        if (current.size === 0) published.delete(key);
        resolve(key);
      };
    },
    subscribeRequests(listener: () => void): () => void {
      requestListeners.add(listener);
      return () => {
        requestListeners.delete(listener);
      };
    },
    getRequested(): readonly Target[] {
      return requested;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get(target: Target): Decoration | null {
      return resolved.get(keyOf(target)) ?? null;
    },
  };
}

const projectStore = createDecorationStore<
  string,
  ExperimentalResolvedSidebarThreadDecoration
>((projectId) => projectId);

const threadStore = createDecorationStore<
  ThreadRowTarget,
  ExperimentalResolvedSidebarThreadRowDecoration
>(({ projectId, threadId }) => `${projectId}\u0000${threadId}`);

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export function parseSidebarThreadDecoration(
  value: unknown,
): ExperimentalResolvedSidebarThreadDecoration | null {
  if (typeof value !== "object" || value === null) return null;
  const decoration = value as Partial<
    Record<keyof ExperimentalSidebarThreadDecoration, unknown>
  >;
  const leading = nonBlank(decoration.leading);
  const hue = parseHue(decoration.hue);
  if (leading === null && hue === null) return null;
  return { leading, title: nonBlank(decoration.title), hue };
}

function parseHue(value: unknown): number | null {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 360
    ? value
    : null;
}

export function parseSidebarThreadRowDecoration(
  value: unknown,
): ExperimentalResolvedSidebarThreadRowDecoration | null {
  if (typeof value !== "object" || value === null) return null;
  const decoration = value as Partial<
    Record<keyof ExperimentalSidebarThreadRowDecoration, unknown>
  >;
  const label = nonBlank(decoration.label);
  const parsed: ExperimentalResolvedSidebarThreadRowDecoration = {
    icon: parseRowIcon(decoration.icon),
    label,
    labelHref: label === null ? null : parseHttpUrl(decoration.labelHref),
    description: nonBlank(decoration.description),
    trailing: parseRowTrailing(decoration.trailing),
    pullRequest: parseRowPullRequest(decoration.pullRequest),
  };
  return Object.values(parsed).every((field) => field === null) ? null : parsed;
}

export function useSidebarThreadDecoration(
  projectId: string,
): ExperimentalResolvedSidebarThreadDecoration | null {
  useEffect(() => projectStore.request(projectId), [projectId]);
  const getSnapshot = () => projectStore.get(projectId);
  return useSyncExternalStore(projectStore.subscribe, getSnapshot, getSnapshot);
}

export function useSidebarThreadRowDecoration(
  threadId: string,
  projectId: string,
): ExperimentalResolvedSidebarThreadRowDecoration | null {
  useEffect(
    () => threadStore.request({ threadId, projectId }),
    [threadId, projectId],
  );
  const getSnapshot = () => threadStore.get({ threadId, projectId });
  return useSyncExternalStore(threadStore.subscribe, getSnapshot, getSnapshot);
}

function ProjectDecorationRunner({
  slot,
  useDecoration,
  projectId,
}: {
  slot: ExperimentalSidebarThreadDecorationSlot;
  useDecoration: NonNullable<
    ExperimentalSidebarThreadDecorationSlot["useDecoration"]
  >;
  projectId: string;
}) {
  const decoration = useDecoration(projectId);
  useEffect(
    () =>
      projectStore.publish(
        `${slot.pluginId}/${slot.id}`,
        projectId,
        parseSidebarThreadDecoration(decoration),
      ),
    [decoration, projectId, slot.id, slot.pluginId],
  );
  return null;
}

function ThreadDecorationRunner({
  slot,
  useThreadDecoration,
  target,
}: {
  slot: ExperimentalSidebarThreadDecorationSlot;
  useThreadDecoration: NonNullable<
    ExperimentalSidebarThreadDecorationSlot["useThreadDecoration"]
  >;
  target: ThreadRowTarget;
}) {
  const decoration = useThreadDecoration(target.threadId, target.projectId);
  useEffect(
    () =>
      threadStore.publish(
        `${slot.pluginId}/${slot.id}`,
        target,
        parseSidebarThreadRowDecoration(decoration),
      ),
    [decoration, target, slot.id, slot.pluginId],
  );
  return null;
}

const SidebarThreadDecorationProvider = memo(
  function SidebarThreadDecorationProvider({
    slot,
    projectIds,
    threadTargets,
  }: {
    slot: ExperimentalSidebarThreadDecorationSlot;
    projectIds: readonly string[];
    threadTargets: readonly ThreadRowTarget[];
  }) {
    const { useDecoration, useThreadDecoration } = slot;
    return (
      <PluginSlotMount
        pluginId={slot.pluginId}
        slotKind={SLOT_KIND}
        slotId={slot.id}
        crashFallback={null}
      >
        {useDecoration === undefined
          ? null
          : projectIds.map((projectId) => (
              <ProjectDecorationRunner
                key={projectId}
                slot={slot}
                useDecoration={useDecoration}
                projectId={projectId}
              />
            ))}
        {useThreadDecoration === undefined
          ? null
          : threadTargets.map((target) => (
              <ThreadDecorationRunner
                key={`${target.projectId}/${target.threadId}`}
                slot={slot}
                useThreadDecoration={useThreadDecoration}
                target={target}
              />
            ))}
      </PluginSlotMount>
    );
  },
);

export function PluginSidebarThreadDecorationProviders() {
  const { sidebarThreadDecorations } = usePluginSlots();
  const projectIds = useSyncExternalStore(
    projectStore.subscribeRequests,
    projectStore.getRequested,
    projectStore.getRequested,
  );
  const threadTargets = useSyncExternalStore(
    threadStore.subscribeRequests,
    threadStore.getRequested,
    threadStore.getRequested,
  );
  if (
    sidebarThreadDecorations.length === 0 ||
    (projectIds.length === 0 && threadTargets.length === 0)
  ) {
    return null;
  }
  return (
    <div data-bb-plugin-sidebar-thread-decorations="" hidden>
      {sidebarThreadDecorations.map((slot) => (
        <SidebarThreadDecorationProvider
          key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
          slot={slot}
          projectIds={projectIds}
          threadTargets={threadTargets}
        />
      ))}
    </div>
  );
}
