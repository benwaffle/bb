import type {
  ExperimentalResolvedSidebarThreadGroup,
  ExperimentalSidebarThreadGroupRow,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import type { PendingInteractionKind } from "../../shared/contract.js";
import { graceStatus, type GraceState } from "./grace.js";
import {
  deriveInboxStatus,
  isWorkingStatus,
  needsAttention,
  type InboxStatus,
} from "./status.js";

export type InboxSection = "pinned" | "inbox" | "working" | "done";

export const INBOX_SECTIONS: readonly InboxSection[] = [
  "pinned",
  "inbox",
  "working",
  "done",
];

export interface InboxEntry {
  thread: PluginSidebarThread;
  status: InboxStatus;
  section: InboxSection;
  returnAt: number;
  workingSince: number | null;
}

export interface InboxThreadNode {
  kind: "thread";
  entry: InboxEntry;
  children: InboxThreadNode[];
  detachedFrom: { id: string; title: string } | null;
}

export interface InboxGroupNode {
  kind: "group";
  group: ExperimentalResolvedSidebarThreadGroup;
  rows: InboxThreadNode[];
  placeholders: ExperimentalSidebarThreadGroupRow[];
}

export type InboxNode = InboxThreadNode | InboxGroupNode;

export interface InboxSectionLayout {
  nodes: InboxNode[];
  threadCount: number;
}

export type InboxLayout = Record<InboxSection, InboxSectionLayout>;

export function placeSection(
  status: InboxStatus,
  isPinned: boolean,
): InboxSection {
  if (isPinned) return "pinned";
  if (isWorkingStatus(status)) return "working";
  if (needsAttention(status)) return "inbox";
  return "done";
}

export function buildInboxEntries(
  threads: readonly PluginSidebarThread[],
  pendingKinds: Readonly<Record<string, PendingInteractionKind>>,
  grace: GraceState,
): InboxEntry[] {
  const entries: InboxEntry[] = [];
  for (const thread of threads) {
    if (thread.isHidden || thread.isArchived) continue;
    const derived = deriveInboxStatus(thread, pendingKinds[thread.id] ?? null);
    const status = graceStatus(grace, thread.id) ?? derived;
    entries.push({
      thread,
      status,
      section: placeSection(status, thread.isPinned),
      returnAt: Math.max(
        thread.latestAttentionAt,
        grace.returnedAt.get(thread.id) ?? 0,
      ),
      workingSince: grace.workingSince.get(thread.id) ?? null,
    });
  }
  return entries;
}

const SECTION_URGENCY: Record<InboxSection, number> = {
  inbox: 3,
  working: 2,
  pinned: 1,
  done: 0,
};

export function childEscapesParent(
  childSection: InboxSection,
  parentSection: InboxSection,
): boolean {
  if (childSection === "pinned") return true;
  if (childSection === "inbox") return parentSection !== "inbox";
  if (childSection === "working") return parentSection === "done";
  return false;
}

function comparePinned(left: InboxEntry, right: InboxEntry): number {
  const leftKey = left.thread.pinSortKey;
  const rightKey = right.thread.pinSortKey;
  if (leftKey !== null && rightKey !== null && leftKey !== rightKey) {
    return leftKey < rightKey ? -1 : 1;
  }
  if (leftKey !== null && rightKey === null) return -1;
  if (leftKey === null && rightKey !== null) return 1;
  return (left.thread.pinnedAt ?? 0) - (right.thread.pinnedAt ?? 0);
}

function sortAt(entry: InboxEntry): number {
  if (entry.section === "working") {
    return entry.workingSince ?? entry.thread.updatedAt;
  }
  return entry.returnAt;
}

function nodeSortAt(node: InboxNode): number {
  if (node.kind === "thread") return sortAt(node.entry);
  let latest = 0;
  for (const row of node.rows) latest = Math.max(latest, sortAt(row.entry));
  return latest;
}

function compareNodes(
  section: InboxSection,
  left: InboxNode,
  right: InboxNode,
): number {
  if (section === "pinned" && left.kind === "thread" && right.kind === "thread") {
    return comparePinned(left.entry, right.entry);
  }
  return nodeSortAt(right) - nodeSortAt(left);
}

function countThreads(node: InboxThreadNode): number {
  let count = 1;
  for (const child of node.children) count += countThreads(child);
  return count;
}

function isPlaceholderRow(
  row: ExperimentalResolvedSidebarThreadGroup["rows"][number],
): row is ExperimentalSidebarThreadGroupRow {
  return !("threadId" in row);
}

export function buildInboxLayout(
  entries: readonly InboxEntry[],
  groups: readonly ExperimentalResolvedSidebarThreadGroup[],
): InboxLayout {
  const byId = new Map(entries.map((entry) => [entry.thread.id, entry]));
  const nestingParent = (entry: InboxEntry): InboxEntry | null => {
    const parentId = entry.thread.parentThreadId;
    if (parentId === null || parentId === entry.thread.id) return null;
    return byId.get(parentId) ?? null;
  };

  const displayed = new Map<string, InboxSection>();
  const attached = new Set<string>();
  const resolveDisplayed = (
    entry: InboxEntry,
    visiting: Set<string>,
  ): InboxSection => {
    const known = displayed.get(entry.thread.id);
    if (known !== undefined) return known;
    const parent = nestingParent(entry);
    let section = entry.section;
    if (parent !== null && !visiting.has(parent.thread.id)) {
      visiting.add(entry.thread.id);
      const parentSection = resolveDisplayed(parent, visiting);
      if (!childEscapesParent(entry.section, parentSection)) {
        attached.add(entry.thread.id);
        section = parentSection;
      }
    }
    displayed.set(entry.thread.id, section);
    return section;
  };
  for (const entry of entries) resolveDisplayed(entry, new Set());

  const nodes = new Map<string, InboxThreadNode>();
  for (const entry of entries) {
    const parent = nestingParent(entry);
    nodes.set(entry.thread.id, {
      kind: "thread",
      entry,
      children: [],
      detachedFrom:
        parent !== null && !attached.has(entry.thread.id)
          ? { id: parent.thread.id, title: parent.thread.displayTitle }
          : null,
    });
  }
  const roots: InboxThreadNode[] = [];
  for (const entry of entries) {
    const node = nodes.get(entry.thread.id)!;
    if (attached.has(entry.thread.id)) {
      nodes.get(entry.thread.parentThreadId!)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  for (const node of nodes.values()) {
    node.children.sort(
      (left, right) => left.entry.thread.createdAt - right.entry.thread.createdAt,
    );
  }

  const claimed = new Set<string>();
  const groupNodes: { node: InboxGroupNode; section: InboxSection }[] = [];
  const rootsById = new Map(roots.map((node) => [node.entry.thread.id, node]));
  for (const group of groups) {
    const rows: InboxThreadNode[] = [];
    for (const threadId of group.threadIds) {
      const node = rootsById.get(threadId);
      if (node === undefined || claimed.has(threadId)) continue;
      if (node.entry.section === "pinned") continue;
      if (node.entry.thread.projectId !== group.projectId) continue;
      if (node.detachedFrom !== null) continue;
      rows.push(node);
    }
    const placeholders = group.rows.filter(isPlaceholderRow);
    if (rows.length < 2 && placeholders.length === 0) continue;
    for (const row of rows) claimed.add(row.entry.thread.id);
    let section: InboxSection = "done";
    for (const row of rows) {
      if (SECTION_URGENCY[row.entry.section] > SECTION_URGENCY[section]) {
        section = row.entry.section;
      }
    }
    groupNodes.push({ node: { kind: "group", group, rows, placeholders }, section });
  }

  const layout: InboxLayout = {
    pinned: { nodes: [], threadCount: 0 },
    inbox: { nodes: [], threadCount: 0 },
    working: { nodes: [], threadCount: 0 },
    done: { nodes: [], threadCount: 0 },
  };
  for (const root of roots) {
    if (claimed.has(root.entry.thread.id)) continue;
    const section = displayed.get(root.entry.thread.id)!;
    layout[section].nodes.push(root);
    layout[section].threadCount += countThreads(root);
  }
  for (const { node, section } of groupNodes) {
    node.rows.sort((left, right) => compareNodes(section, left, right));
    layout[section].nodes.push(node);
    for (const row of node.rows) layout[section].threadCount += countThreads(row);
  }
  for (const section of INBOX_SECTIONS) {
    layout[section].nodes.sort((left, right) =>
      compareNodes(section, left, right),
    );
  }
  return layout;
}
