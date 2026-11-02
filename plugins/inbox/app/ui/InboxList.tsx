import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  experimental_Icon as PluginIcon,
  experimental_useProviders,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { InboxNode, InboxSection } from "../model/layout.js";
import { nodeContainsThread } from "../model/row-equality.js";
import { useInboxData, useProjectIcons } from "../model/use-inbox-data.js";
import { InboxClockProvider } from "./InboxClock.js";
import { InboxGroup } from "./InboxGroup.js";
import { InboxThreadRow, type InboxRowContext } from "./InboxRow.js";

const SHELF_STORAGE_PREFIX = "bb-inbox:shelf-expanded:";

function readShelfExpanded(section: InboxSection): boolean {
  try {
    return globalThis.localStorage?.getItem(SHELF_STORAGE_PREFIX + section) === "true";
  } catch {
    return false;
  }
}

function writeShelfExpanded(section: InboxSection, expanded: boolean): void {
  try {
    globalThis.localStorage?.setItem(
      SHELF_STORAGE_PREFIX + section,
      expanded ? "true" : "false",
    );
  } catch {
    return;
  }
}

function useShelfExpanded(
  section: InboxSection,
): [boolean, (expanded: boolean) => void] {
  const [expanded, setExpanded] = useState(() => readShelfExpanded(section));
  const update = useCallback(
    (next: boolean) => {
      setExpanded(next);
      writeShelfExpanded(section, next);
    },
    [section],
  );
  return [expanded, update];
}

function InboxNodes({
  nodes,
  activeThreadId,
  context,
}: {
  nodes: readonly InboxNode[];
  activeThreadId: string | null;
  context: InboxRowContext;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.kind === "group" ? (
          <InboxGroup
            key={node.group.id}
            node={node}
            activeThreadId={activeThreadId}
            context={context}
          />
        ) : (
          <InboxThreadRow
            key={node.entry.thread.id}
            node={node}
            depth={0}
            activeThreadId={activeThreadId}
            context={context}
          />
        ),
      )}
    </>
  );
}

const SECTION_HEADER_CLASS =
  "sticky top-0 z-20 flex h-7 w-full items-center gap-1.5 border-b border-sidebar-border bg-sidebar px-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-muted-foreground";

function SectionHeader({
  children,
  count,
}: {
  children: ReactNode;
  count: number;
}) {
  return (
    <div className={SECTION_HEADER_CLASS}>
      {children}
      <span className="font-normal tabular-nums text-subtle-foreground">{count}</span>
    </div>
  );
}

function topLevelRowCount(nodes: readonly InboxNode[]): number {
  let count = 0;
  for (const node of nodes) count += node.kind === "group" ? node.rows.length : 1;
  return count;
}

function mostCommonHostName(nodes: readonly InboxNode[]): string | null {
  const counts = new Map<string, number>();
  const visit = (list: readonly InboxNode[]) => {
    for (const node of list) {
      if (node.kind === "group") {
        visit(node.rows);
        continue;
      }
      const host = node.entry.thread.host?.name;
      if (host != null) counts.set(host, (counts.get(host) ?? 0) + 1);
      visit(node.children);
    }
  };
  visit(nodes);
  let best: string | null = null;
  let bestCount = 0;
  for (const [host, count] of counts) {
    if (count > bestCount) {
      best = host;
      bestCount = count;
    }
  }
  return best;
}

function collectProviderIds(nodes: readonly InboxNode[], into: Set<string>): void {
  for (const node of nodes) {
    if (node.kind === "group") {
      collectProviderIds(node.rows, into);
    } else {
      into.add(node.entry.thread.providerId);
      collectProviderIds(node.children, into);
    }
  }
}

function Shelf({
  section,
  title,
  nodes,
  threadCount,
  activeThreadId,
  context,
  expanded,
  setExpanded,
}: {
  section: InboxSection;
  title: string;
  nodes: readonly InboxNode[];
  threadCount: number;
  activeThreadId: string | null;
  context: InboxRowContext;
  expanded: boolean;
  setExpanded(expanded: boolean): void;
}) {
  const visibleNodes = useMemo(() => {
    if (expanded) return nodes;
    if (activeThreadId === null) return [];
    return nodes.filter((node) => nodeContainsThread(node, activeThreadId));
  }, [expanded, nodes, activeThreadId]);
  return (
    <section
      aria-label={title}
      data-inbox-section={section}
      className="flex flex-col gap-px"
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className={cn(SECTION_HEADER_CLASS, "hover:text-foreground")}
      >
        <Icon
          name="ChevronRight"
          className={cn(
            "size-3 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span>{title}</span>
        <span className="font-normal tabular-nums text-subtle-foreground">
          {threadCount}
        </span>
      </button>
      <InboxNodes
        nodes={visibleNodes}
        activeThreadId={activeThreadId}
        context={context}
      />
    </section>
  );
}

function useStableCallback(callback: () => void): () => void {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  }, [callback]);
  return useCallback(() => latest.current(), []);
}

const NAME_FIELD_SEPARATOR = "\u0000";
const NAME_ENTRY_SEPARATOR = "\u0001";

function encodeProjectNames(
  projectsById: ReadonlyMap<string, { name: string }>,
): string {
  return [...projectsById]
    .map(([projectId, project]) => projectId + NAME_FIELD_SEPARATOR + project.name)
    .join(NAME_ENTRY_SEPARATOR);
}

function decodeProjectNames(encoded: string): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (encoded === "") return names;
  for (const pair of encoded.split(NAME_ENTRY_SEPARATOR)) {
    const split = pair.indexOf(NAME_FIELD_SEPARATOR);
    names.set(pair.slice(0, split), pair.slice(split + 1));
  }
  return names;
}

export function InboxList(props: PluginThreadListProps) {
  return (
    <InboxClockProvider>
      <InboxListView {...props} />
    </InboxClockProvider>
  );
}

function InboxListView({ activeThreadId, onNavigate }: PluginThreadListProps) {
  const { status, layout, projectsById } = useInboxData();
  const [workingExpanded, setWorkingExpanded] = useShelfExpanded("working");
  const [snoozedExpanded, setSnoozedExpanded] = useShelfExpanded("snoozed");
  const [settledExpanded, setSettledExpanded] = useShelfExpanded("settled");
  const defaultHostName = useMemo(
    () => mostCommonHostName(Object.values(layout).flatMap((section) => section.nodes)),
    [layout],
  );
  const mixedProviders = useMemo(() => {
    const ids = new Set<string>();
    for (const section of Object.values(layout)) collectProviderIds(section.nodes, ids);
    return ids.size > 1;
  }, [layout]);
  const icons = useProjectIcons();
  const { providers } = experimental_useProviders();
  const navigate = useStableCallback(onNavigate);
  const encodedNames = useMemo(
    () => encodeProjectNames(projectsById),
    [projectsById],
  );
  const projectNames = useMemo(
    () => decodeProjectNames(encodedNames),
    [encodedNames],
  );
  const providersById = useMemo(
    () => new Map(providers.map((provider) => [provider.id, provider])),
    [providers],
  );
  const context = useMemo<InboxRowContext>(
    () => ({
      onNavigate: navigate,
      projectName: (projectId) => {
        const name = projectNames.get(projectId);
        return name === undefined || name === "" ? null : name;
      },
      projectIconUrl: (projectId) => icons[projectId] ?? null,
      provider: (providerId) =>
        mixedProviders ? (providersById.get(providerId) ?? null) : null,
      defaultHostName,
    }),
    [navigate, projectNames, icons, providersById, mixedProviders, defaultHostName],
  );
  if (status === "loading") return null;
  const { pinned, inbox, working, snoozed, settled } = layout;
  const shelvesPinned =
    !(working.nodes.length > 0 && workingExpanded) &&
    !(snoozed.nodes.length > 0 && snoozedExpanded) &&
    !(settled.nodes.length > 0 && settledExpanded);
  const inboxEmpty = inbox.nodes.length === 0;
  return (
    <nav
      aria-label="Threads"
      data-inbox-list=""
      className="flex min-h-full flex-col gap-px px-2 pb-2"
    >
      {pinned.nodes.length > 0 ? (
        <section aria-label="Pinned" data-inbox-section="pinned" className="flex flex-col gap-px">
          <SectionHeader count={topLevelRowCount(pinned.nodes)}>
            <Icon name="Pin" className="size-3" />
            Pinned
          </SectionHeader>
          <InboxNodes
            nodes={pinned.nodes}
            activeThreadId={activeThreadId}
            context={context}
          />
        </section>
      ) : null}
      <section
        aria-label="Inbox"
        data-inbox-section="inbox"
        className={cn("flex flex-col gap-px", pinned.nodes.length > 0 && "mt-2")}
      >
        <SectionHeader count={topLevelRowCount(inbox.nodes)}>
          <PluginIcon name="Inbox" fallback="Layers" className="size-3" />
          Inbox
        </SectionHeader>
        {inboxEmpty ? (
          <div className="flex flex-col items-center gap-1 px-4 py-8 text-center">
            <span className="text-sm font-medium text-foreground">
              Nothing needs you
            </span>
            <span className="text-xs text-muted-foreground">
              {working.threadCount} working
            </span>
          </div>
        ) : (
          <InboxNodes
            nodes={inbox.nodes}
            activeThreadId={activeThreadId}
            context={context}
          />
        )}
      </section>
      <div
        className={cn(
          "mt-auto flex flex-col gap-2 pt-3",
          shelvesPinned &&
            "sticky bottom-0 z-20 -mx-2 border-t border-sidebar-border bg-sidebar px-2 pb-1 pt-1 before:pointer-events-none before:absolute before:inset-x-0 before:-top-6 before:h-6 before:bg-linear-to-t before:from-sidebar before:to-transparent",
        )}
      >
        {working.nodes.length > 0 ? (
          <Shelf
            section="working"
            title="Working"
            nodes={working.nodes}
            threadCount={topLevelRowCount(working.nodes)}
            activeThreadId={activeThreadId}
            context={context}
            expanded={workingExpanded}
            setExpanded={setWorkingExpanded}
          />
        ) : null}
        {snoozed.nodes.length > 0 ? (
          <Shelf
            section="snoozed"
            title="Snoozed"
            nodes={snoozed.nodes}
            threadCount={topLevelRowCount(snoozed.nodes)}
            activeThreadId={activeThreadId}
            context={context}
            expanded={snoozedExpanded}
            setExpanded={setSnoozedExpanded}
          />
        ) : null}
        {settled.nodes.length > 0 ? (
          <Shelf
            section="settled"
            title="Settled"
            nodes={settled.nodes}
            threadCount={topLevelRowCount(settled.nodes)}
            activeThreadId={activeThreadId}
            context={context}
            expanded={settledExpanded}
            setExpanded={setSettledExpanded}
          />
        ) : null}
      </div>
    </nav>
  );
}
