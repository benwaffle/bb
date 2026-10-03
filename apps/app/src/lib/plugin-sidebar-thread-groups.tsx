import { memo, useEffect, useSyncExternalStore } from "react";
import type {
  ExperimentalResolvedSidebarThreadGroup,
  ExperimentalSidebarThreadGroup,
  ExperimentalSidebarThreadGroupRow,
} from "@get-bb/plugin-sdk";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import {
  usePluginSlots,
  type ExperimentalSidebarThreadGroupsSlot,
} from "./plugin-slots";

interface PublishedGroups {
  pluginId: string;
  slotId: string;
  groups: readonly ExperimentalSidebarThreadGroup[];
}

const publishedBySource = new Map<string, PublishedGroups>();
const listeners = new Set<() => void>();
const EMPTY_GROUPS: readonly ExperimentalResolvedSidebarThreadGroup[] = [];
let snapshot: readonly ExperimentalResolvedSidebarThreadGroup[] = EMPTY_GROUPS;

function sourceKey(pluginId: string, slotId: string): string {
  return `${pluginId}/${slotId}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseRow(value: unknown): ExperimentalSidebarThreadGroupRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Partial<ExperimentalSidebarThreadGroupRow>;
  if (!isNonEmptyString(row.id) || typeof row.title !== "string") return null;
  if (typeof row.onSelect !== "function") return null;
  const action = row.action;
  const validAction =
    action !== undefined &&
    typeof action.label === "string" &&
    typeof action.run === "function";
  return {
    id: row.id,
    title: row.title,
    ...(typeof row.description === "string"
      ? { description: row.description }
      : {}),
    ...(typeof row.tooltip === "string" ? { tooltip: row.tooltip } : {}),
    onSelect: row.onSelect,
    ...(validAction ? { action } : {}),
  };
}

function parseGroup(value: unknown): ExperimentalSidebarThreadGroup | null {
  if (typeof value !== "object" || value === null) return null;
  const group = value as Partial<ExperimentalSidebarThreadGroup>;
  if (
    !isNonEmptyString(group.projectId) ||
    !isNonEmptyString(group.key) ||
    typeof group.label !== "string" ||
    !Array.isArray(group.threadIds) ||
    !Array.isArray(group.rows)
  ) {
    return null;
  }
  const rowIds = new Set<string>();
  const rows: ExperimentalSidebarThreadGroupRow[] = [];
  for (const raw of group.rows) {
    const row = parseRow(raw);
    if (row === null || rowIds.has(row.id)) continue;
    rowIds.add(row.id);
    rows.push(row);
  }
  return {
    projectId: group.projectId,
    key: group.key,
    label: group.label,
    ...(typeof group.tooltip === "string" ? { tooltip: group.tooltip } : {}),
    threadIds: group.threadIds.filter(isNonEmptyString),
    rows,
  };
}

export function parseSidebarThreadGroups(
  value: unknown,
): ExperimentalSidebarThreadGroup[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  const groups: ExperimentalSidebarThreadGroup[] = [];
  for (const raw of value) {
    const group = parseGroup(raw);
    if (group === null || keys.has(group.key)) continue;
    keys.add(group.key);
    groups.push(group);
  }
  return groups;
}

function rebuildSnapshot(): void {
  const sources = [...publishedBySource.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const next: ExperimentalResolvedSidebarThreadGroup[] = [];
  for (const [key, published] of sources) {
    for (const group of published.groups) {
      next.push({
        ...group,
        id: `${key}:${group.key}`,
        pluginId: published.pluginId,
      });
    }
  }
  snapshot = next.length === 0 ? EMPTY_GROUPS : next;
  for (const listener of listeners) listener();
}

export function publishSidebarThreadGroups(
  pluginId: string,
  slotId: string,
  groups: unknown,
): () => void {
  const key = sourceKey(pluginId, slotId);
  const published: PublishedGroups = {
    pluginId,
    slotId,
    groups: parseSidebarThreadGroups(groups),
  };
  publishedBySource.set(key, published);
  rebuildSnapshot();
  return () => {
    if (publishedBySource.get(key) !== published) return;
    publishedBySource.delete(key);
    rebuildSnapshot();
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): readonly ExperimentalResolvedSidebarThreadGroup[] {
  return snapshot;
}

export function useSidebarThreadGroups(): readonly ExperimentalResolvedSidebarThreadGroup[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function resetSidebarThreadGroupsForTest(): void {
  publishedBySource.clear();
  snapshot = EMPTY_GROUPS;
}

function SidebarThreadGroupsRunner({
  slot,
}: {
  slot: ExperimentalSidebarThreadGroupsSlot;
}) {
  const groups = slot.useGroups();
  useEffect(
    () => publishSidebarThreadGroups(slot.pluginId, slot.id, groups),
    [groups, slot.id, slot.pluginId],
  );
  return null;
}

const SidebarThreadGroupsProvider = memo(function SidebarThreadGroupsProvider({
  slot,
}: {
  slot: ExperimentalSidebarThreadGroupsSlot;
}) {
  return (
    <PluginSlotMount
      pluginId={slot.pluginId}
      slotKind="sidebarThreadGroups"
      slotId={slot.id}
      crashFallback={null}
    >
      <SidebarThreadGroupsRunner slot={slot} />
    </PluginSlotMount>
  );
});

export function PluginSidebarThreadGroupProviders() {
  const { sidebarThreadGroups } = usePluginSlots();
  if (sidebarThreadGroups.length === 0) return null;
  return (
    <div data-bb-plugin-sidebar-thread-groups="" hidden>
      {sidebarThreadGroups.map((slot) => (
        <SidebarThreadGroupsProvider
          key={`${slot.pluginId}/${slot.id}/${slot.generation}`}
          slot={slot}
        />
      ))}
    </div>
  );
}
