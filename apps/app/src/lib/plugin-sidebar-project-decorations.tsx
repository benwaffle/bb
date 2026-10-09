import { memo, useEffect, useSyncExternalStore, type ReactNode } from "react";
import type {
  ExperimentalResolvedSidebarProjectDecoration,
  ExperimentalSidebarProjectDecoration,
} from "@get-bb/plugin-sdk";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import {
  usePluginSlots,
  type ExperimentalSidebarProjectDecorationSlot,
} from "./plugin-slots";

const SLOT_KIND = "sidebarProjectDecorations";

interface ParsedSidebarProjectDecoration {
  leading: ReactNode | null;
  accentColor: string | null;
  labelClassName: string | null;
  tint: boolean;
}

interface PublishedDecoration {
  pluginId: string;
  slotId: string;
  decoration: ParsedSidebarProjectDecoration;
}

const requestCounts = new Map<string, number>();
const requestListeners = new Set<() => void>();
const EMPTY_PROJECT_IDS: readonly string[] = [];
let requestedProjectIds: readonly string[] = EMPTY_PROJECT_IDS;

const publishedByProject = new Map<string, Map<string, PublishedDecoration>>();
const resolvedByProject = new Map<
  string,
  ExperimentalResolvedSidebarProjectDecoration
>();
const decorationListeners = new Set<() => void>();

function sourceKey(pluginId: string, slotId: string): string {
  return `${pluginId}/${slotId}`;
}

function isCssColor(value: unknown): value is string {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  const css = globalThis.CSS as typeof CSS | undefined;
  return typeof css?.supports !== "function" || css.supports("color", value);
}

function parseLeading(value: unknown): ReactNode | null {
  if (value === undefined || value === null || typeof value === "boolean") {
    return null;
  }
  if (typeof value === "string" && value.length === 0) return null;
  return value as ReactNode;
}

export function parseSidebarProjectDecoration(
  value: unknown,
): ParsedSidebarProjectDecoration | null {
  if (typeof value !== "object" || value === null) return null;
  const decoration = value as Partial<ExperimentalSidebarProjectDecoration>;
  const accentColor = isCssColor(decoration.accentColor)
    ? decoration.accentColor.trim()
    : null;
  const labelClassName =
    typeof decoration.labelClassName === "string" &&
    decoration.labelClassName.trim().length > 0
      ? decoration.labelClassName.trim()
      : null;
  const leading = parseLeading(decoration.leading);
  const tint = decoration.tint === true && accentColor !== null;
  if (leading === null && accentColor === null && labelClassName === null) {
    return null;
  }
  return { leading, accentColor, labelClassName, tint };
}

function resolveProject(projectId: string): void {
  const sources = [...(publishedByProject.get(projectId)?.entries() ?? [])]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, published]) => published);
  if (sources.length === 0) {
    resolvedByProject.delete(projectId);
    return;
  }
  const leading = sources.flatMap((published) =>
    published.decoration.leading === null
      ? []
      : [
          <PluginSlotMount
            key={sourceKey(published.pluginId, published.slotId)}
            pluginId={published.pluginId}
            slotKind={SLOT_KIND}
            slotId={published.slotId}
            instanceId={`leading/${projectId}`}
            crashFallback={null}
          >
            {published.decoration.leading}
          </PluginSlotMount>,
        ],
  );
  const styled = sources.find(
    (published) =>
      published.decoration.accentColor !== null ||
      published.decoration.labelClassName !== null,
  )?.decoration;
  resolvedByProject.set(projectId, {
    leading: leading.length === 0 ? null : leading,
    accentColor: styled?.accentColor ?? null,
    labelClassName: styled?.labelClassName ?? null,
    tint: styled?.tint ?? false,
  });
}

function notifyDecorations(): void {
  for (const listener of decorationListeners) listener();
}

export function publishSidebarProjectDecoration(
  pluginId: string,
  slotId: string,
  projectId: string,
  value: unknown,
): () => void {
  const key = sourceKey(pluginId, slotId);
  const decoration = parseSidebarProjectDecoration(value);
  const published =
    decoration === null ? null : { pluginId, slotId, decoration };
  let sources = publishedByProject.get(projectId);
  if (published === null) {
    if (!sources?.delete(key)) return () => undefined;
  } else {
    if (!sources) {
      sources = new Map();
      publishedByProject.set(projectId, sources);
    }
    sources.set(key, published);
  }
  if (sources?.size === 0) publishedByProject.delete(projectId);
  resolveProject(projectId);
  notifyDecorations();
  if (published === null) return () => undefined;
  return () => {
    const current = publishedByProject.get(projectId);
    if (current?.get(key) !== published) return;
    current.delete(key);
    if (current.size === 0) publishedByProject.delete(projectId);
    resolveProject(projectId);
    notifyDecorations();
  };
}

function rebuildRequestedProjectIds(): void {
  requestedProjectIds =
    requestCounts.size === 0 ? EMPTY_PROJECT_IDS : [...requestCounts.keys()];
  for (const listener of requestListeners) listener();
}

function requestProjectDecoration(projectId: string): () => void {
  const count = requestCounts.get(projectId) ?? 0;
  requestCounts.set(projectId, count + 1);
  if (count === 0) rebuildRequestedProjectIds();
  return () => {
    const remaining = (requestCounts.get(projectId) ?? 1) - 1;
    if (remaining > 0) {
      requestCounts.set(projectId, remaining);
      return;
    }
    requestCounts.delete(projectId);
    rebuildRequestedProjectIds();
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

export function useSidebarProjectDecoration(
  projectId: string,
): ExperimentalResolvedSidebarProjectDecoration | null {
  useEffect(() => requestProjectDecoration(projectId), [projectId]);
  const getSnapshot = () => resolvedByProject.get(projectId) ?? null;
  return useSyncExternalStore(subscribeDecorations, getSnapshot, getSnapshot);
}

export function resetSidebarProjectDecorationsForTest(): void {
  requestCounts.clear();
  requestedProjectIds = EMPTY_PROJECT_IDS;
  publishedByProject.clear();
  resolvedByProject.clear();
}

function SidebarProjectDecorationRunner({
  slot,
  projectId,
}: {
  slot: ExperimentalSidebarProjectDecorationSlot;
  projectId: string;
}) {
  const decoration = slot.useDecoration(projectId);
  useEffect(
    () =>
      publishSidebarProjectDecoration(
        slot.pluginId,
        slot.id,
        projectId,
        decoration,
      ),
    [decoration, projectId, slot.id, slot.pluginId],
  );
  return null;
}

const SidebarProjectDecorationProvider = memo(
  function SidebarProjectDecorationProvider({
    slot,
    projectIds,
  }: {
    slot: ExperimentalSidebarProjectDecorationSlot;
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
          <SidebarProjectDecorationRunner
            key={projectId}
            slot={slot}
            projectId={projectId}
          />
        ))}
      </PluginSlotMount>
    );
  },
);

export function PluginSidebarProjectDecorationProviders() {
  const { sidebarProjectDecorations } = usePluginSlots();
  const projectIds = useSyncExternalStore(
    subscribeRequests,
    getRequestedProjectIds,
    getRequestedProjectIds,
  );
  if (sidebarProjectDecorations.length === 0 || projectIds.length === 0) {
    return null;
  }
  return (
    <div data-bb-plugin-sidebar-project-decorations="" hidden>
      {sidebarProjectDecorations.map((slot) => (
        <SidebarProjectDecorationProvider
          key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
          slot={slot}
          projectIds={projectIds}
        />
      ))}
    </div>
  );
}
