import { memo, useEffect, useSyncExternalStore } from "react";
import type {
  ExperimentalResolvedSidebarThreadGroup,
  ExperimentalSidebarThreadGroup,
  ExperimentalSidebarThreadGroupRow,
  ExperimentalSidebarThreadGroupRowIcon,
  ExperimentalSidebarThreadGroupRowTrailing,
  ExperimentalSidebarThreadGroupThreadRow,
  ExperimentalSidebarThreadGroupTone,
  ExperimentalSidebarThreadRowPullRequest,
} from "@get-bb/plugin-sdk";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import {
  usePluginSlots,
  type ExperimentalSidebarThreadGroupsSlot,
} from "./plugin-slots";

type ParsedSidebarThreadGroup = Omit<
  ExperimentalResolvedSidebarThreadGroup,
  "id" | "pluginId"
>;

type ParsedSidebarThreadGroupEntry = ParsedSidebarThreadGroup["rows"][number];

interface PublishedGroups {
  pluginId: string;
  slotId: string;
  groups: readonly ParsedSidebarThreadGroup[];
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

const TONES: ReadonlySet<string> = new Set<ExperimentalSidebarThreadGroupTone>([
  "success",
  "muted",
  "accent",
  "danger",
]);

function isTone(value: unknown): value is ExperimentalSidebarThreadGroupTone {
  return typeof value === "string" && TONES.has(value);
}

export function parseRowIcon(
  value: unknown,
): ExperimentalSidebarThreadGroupRowIcon | null {
  if (typeof value !== "object" || value === null) return null;
  const icon = value as Partial<ExperimentalSidebarThreadGroupRowIcon>;
  if (!isNonEmptyString(icon.name) || !isTone(icon.tone)) return null;
  return { name: icon.name, tone: icon.tone };
}

export function parseRowTrailing(
  value: unknown,
): ExperimentalSidebarThreadGroupRowTrailing | null {
  if (typeof value !== "object" || value === null) return null;
  const trailing = value as {
    kind?: unknown;
    tone?: unknown;
    text?: unknown;
  };
  if (trailing.kind === "dot" && isTone(trailing.tone)) {
    return { kind: "dot", tone: trailing.tone };
  }
  if (trailing.kind === "text" && isNonEmptyString(trailing.text)) {
    return { kind: "text", text: trailing.text };
  }
  return null;
}

const PULL_REQUEST_STATES: ReadonlySet<string> = new Set<
  ExperimentalSidebarThreadRowPullRequest["state"]
>(["draft", "open", "merged", "closed"]);

function isPullRequestState(
  value: unknown,
): value is ExperimentalSidebarThreadRowPullRequest["state"] {
  return typeof value === "string" && PULL_REQUEST_STATES.has(value);
}

export function parseRowPullRequest(
  value: unknown,
): ExperimentalSidebarThreadRowPullRequest | null {
  if (typeof value !== "object" || value === null) return null;
  const { number, state } = value as { number?: unknown; state?: unknown };
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return null;
  }
  return isPullRequestState(state) ? { number, state } : null;
}

function parseRowAdornments(value: {
  icon?: unknown;
  trailing?: unknown;
}): Pick<ExperimentalSidebarThreadGroupRow, "icon" | "trailing"> {
  const icon = parseRowIcon(value.icon);
  const trailing = parseRowTrailing(value.trailing);
  return {
    ...(icon === null ? {} : { icon }),
    ...(trailing === null ? {} : { trailing }),
  };
}

function parseDepth(value: unknown): { depth?: number } {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? { depth: value }
    : {};
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
    ...parseDepth(row.depth),
    ...(typeof row.description === "string"
      ? { description: row.description }
      : {}),
    ...(typeof row.tooltip === "string" ? { tooltip: row.tooltip } : {}),
    ...parseRowAdornments(row),
    ...(row.variant === "ghost" ? { variant: "ghost" as const } : {}),
    onSelect: row.onSelect,
    ...(validAction ? { action } : {}),
  };
}

function parseThreadRow(
  value: unknown,
): ExperimentalSidebarThreadGroupThreadRow | null {
  if (typeof value !== "object" || value === null) return null;
  const row = value as Partial<ExperimentalSidebarThreadGroupThreadRow>;
  if (!isNonEmptyString(row.threadId)) return null;
  const pullRequest = parseRowPullRequest(row.pullRequest);
  return {
    threadId: row.threadId,
    ...parseDepth(row.depth),
    ...(typeof row.description === "string"
      ? { description: row.description }
      : {}),
    ...parseRowAdornments(row),
    ...(pullRequest === null ? {} : { pullRequest }),
  };
}

function parseEntry(value: unknown): ParsedSidebarThreadGroupEntry | null {
  if (typeof value === "object" && value !== null && "threadId" in value) {
    return parseThreadRow(value);
  }
  return parseRow(value);
}

function parseGroupStyle(value: unknown): ParsedSidebarThreadGroup["style"] {
  return value === "card" || value === "minimal" ? value : "flat";
}

function parseGroup(value: unknown): ParsedSidebarThreadGroup | null {
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
  const placedThreadIds = new Set<string>();
  const rows: ParsedSidebarThreadGroupEntry[] = [];
  for (const raw of group.rows) {
    const row = parseEntry(raw);
    if (row === null) continue;
    if ("threadId" in row) {
      if (placedThreadIds.has(row.threadId)) continue;
      placedThreadIds.add(row.threadId);
    } else {
      if (rowIds.has(row.id)) continue;
      rowIds.add(row.id);
    }
    rows.push(row);
  }
  const threadIds = [
    ...new Set([
      ...group.threadIds.filter(isNonEmptyString),
      ...placedThreadIds,
    ]),
  ];
  return {
    projectId: group.projectId,
    key: group.key,
    label: group.label,
    ...(isNonEmptyString(group.keyLabel) ? { keyLabel: group.keyLabel } : {}),
    ...(isNonEmptyString(group.icon) ? { icon: group.icon } : {}),
    ...(typeof group.tooltip === "string" ? { tooltip: group.tooltip } : {}),
    threadIds,
    rows,
    keepOrder: group.keepOrder === true,
    style: parseGroupStyle(group.style),
  };
}

export function parseSidebarThreadGroups(
  value: unknown,
): ParsedSidebarThreadGroup[] {
  if (!Array.isArray(value)) return [];
  const keys = new Set<string>();
  const groups: ParsedSidebarThreadGroup[] = [];
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
