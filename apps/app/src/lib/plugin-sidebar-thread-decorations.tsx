import { memo, useEffect, useSyncExternalStore } from "react";
import type {
  ExperimentalResolvedSidebarThreadDecoration,
  ExperimentalSidebarThreadDecoration,
} from "@get-bb/plugin-sdk";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import {
  usePluginSlots,
  type ExperimentalSidebarThreadDecorationSlot,
} from "./plugin-slots";

const SLOT_KIND = "sidebarThreadDecorations";

const requestCounts = new Map<string, number>();
const requestListeners = new Set<() => void>();
const EMPTY_PROJECT_IDS: readonly string[] = [];
let requestedProjectIds: readonly string[] = EMPTY_PROJECT_IDS;

const publishedByProject = new Map<
  string,
  Map<string, ExperimentalResolvedSidebarThreadDecoration>
>();
const resolvedByProject = new Map<
  string,
  ExperimentalResolvedSidebarThreadDecoration
>();
const decorationListeners = new Set<() => void>();

function nonBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parseSidebarThreadDecoration(
  value: unknown,
): ExperimentalResolvedSidebarThreadDecoration | null {
  if (typeof value !== "object" || value === null) return null;
  const decoration = value as Partial<ExperimentalSidebarThreadDecoration>;
  const leading = nonBlank(decoration.leading);
  if (leading === null) return null;
  return { leading, title: nonBlank(decoration.title) };
}

function resolveProject(projectId: string): void {
  const sources = publishedByProject.get(projectId);
  const firstKey = [...(sources?.keys() ?? [])].sort()[0];
  const first = firstKey === undefined ? undefined : sources?.get(firstKey);
  if (first === undefined) resolvedByProject.delete(projectId);
  else resolvedByProject.set(projectId, first);
  for (const listener of decorationListeners) listener();
}

function publishSidebarThreadDecoration(
  pluginId: string,
  slotId: string,
  projectId: string,
  value: unknown,
): () => void {
  const decoration = parseSidebarThreadDecoration(value);
  if (decoration === null) return () => undefined;
  const key = `${pluginId}/${slotId}`;
  let sources = publishedByProject.get(projectId);
  if (!sources) {
    sources = new Map();
    publishedByProject.set(projectId, sources);
  }
  sources.set(key, decoration);
  resolveProject(projectId);
  return () => {
    const current = publishedByProject.get(projectId);
    if (current?.get(key) !== decoration) return;
    current.delete(key);
    if (current.size === 0) publishedByProject.delete(projectId);
    resolveProject(projectId);
  };
}

function setRequestedProjectIds(): void {
  requestedProjectIds =
    requestCounts.size === 0 ? EMPTY_PROJECT_IDS : [...requestCounts.keys()];
  for (const listener of requestListeners) listener();
}

function requestThreadDecoration(projectId: string): () => void {
  const count = requestCounts.get(projectId) ?? 0;
  requestCounts.set(projectId, count + 1);
  if (count === 0) setRequestedProjectIds();
  return () => {
    const remaining = (requestCounts.get(projectId) ?? 1) - 1;
    if (remaining > 0) {
      requestCounts.set(projectId, remaining);
      return;
    }
    requestCounts.delete(projectId);
    setRequestedProjectIds();
  };
}

function subscribeRequests(listener: () => void): () => void {
  requestListeners.add(listener);
  return () => {
    requestListeners.delete(listener);
  };
}

function getRequestedProjectIds(): readonly string[] {
  return requestedProjectIds;
}

function subscribeDecorations(listener: () => void): () => void {
  decorationListeners.add(listener);
  return () => {
    decorationListeners.delete(listener);
  };
}

export function useSidebarThreadDecoration(
  projectId: string,
): ExperimentalResolvedSidebarThreadDecoration | null {
  useEffect(() => requestThreadDecoration(projectId), [projectId]);
  const getSnapshot = () => resolvedByProject.get(projectId) ?? null;
  return useSyncExternalStore(subscribeDecorations, getSnapshot, getSnapshot);
}

function SidebarThreadDecorationRunner({
  slot,
  projectId,
}: {
  slot: ExperimentalSidebarThreadDecorationSlot;
  projectId: string;
}) {
  const decoration = slot.useDecoration(projectId);
  useEffect(
    () =>
      publishSidebarThreadDecoration(
        slot.pluginId,
        slot.id,
        projectId,
        decoration,
      ),
    [decoration, projectId, slot.id, slot.pluginId],
  );
  return null;
}

const SidebarThreadDecorationProvider = memo(
  function SidebarThreadDecorationProvider({
    slot,
    projectIds,
  }: {
    slot: ExperimentalSidebarThreadDecorationSlot;
    projectIds: readonly string[];
  }) {
    return (
      <PluginSlotMount
        pluginId={slot.pluginId}
        slotKind={SLOT_KIND}
        slotId={slot.id}
        crashFallback={null}
      >
        {projectIds.map((projectId) => (
          <SidebarThreadDecorationRunner
            key={projectId}
            slot={slot}
            projectId={projectId}
          />
        ))}
      </PluginSlotMount>
    );
  },
);

export function PluginSidebarThreadDecorationProviders() {
  const { sidebarThreadDecorations } = usePluginSlots();
  const projectIds = useSyncExternalStore(
    subscribeRequests,
    getRequestedProjectIds,
    getRequestedProjectIds,
  );
  if (sidebarThreadDecorations.length === 0 || projectIds.length === 0) {
    return null;
  }
  return (
    <div data-bb-plugin-sidebar-thread-decorations="" hidden>
      {sidebarThreadDecorations.map((slot) => (
        <SidebarThreadDecorationProvider
          key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
          slot={slot}
          projectIds={projectIds}
        />
      ))}
    </div>
  );
}
