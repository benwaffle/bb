import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
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

function SectionHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[26px] items-center gap-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-subtle-foreground",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Shelf({
  section,
  title,
  nodes,
  threadCount,
  activeThreadId,
  context,
  className,
}: {
  section: InboxSection;
  title: string;
  nodes: readonly InboxNode[];
  threadCount: number;
  activeThreadId: string | null;
  context: InboxRowContext;
  className?: string;
}) {
  const [expanded, setExpanded] = useShelfExpanded(section);
  const visibleNodes = useMemo(() => {
    if (expanded) return nodes;
    if (activeThreadId === null) return [];
    return nodes.filter((node) => nodeContainsThread(node, activeThreadId));
  }, [expanded, nodes, activeThreadId]);
  return (
    <section
      aria-label={title}
      data-inbox-section={section}
      className={cn("flex flex-col gap-px", className)}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="flex h-[26px] w-full items-center gap-1.5 rounded-md px-2.5 text-2xs font-semibold uppercase tracking-[0.06em] text-subtle-foreground hover:bg-state-hover hover:text-muted-foreground"
      >
        <Icon
          name="ChevronRight"
          className={cn(
            "size-3 shrink-0 transition-transform",
            expanded && "rotate-90",
          )}
        />
        <span>{title}</span>
        <span className="ml-auto font-normal tabular-nums">{threadCount}</span>
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
      projectName: (projectId) => projectNames.get(projectId) ?? "Project",
      projectIconUrl: (projectId) => icons[projectId] ?? null,
      provider: (providerId) => providersById.get(providerId) ?? null,
    }),
    [navigate, projectNames, icons, providersById],
  );
  if (status === "loading") return null;
  const { pinned, inbox, working, snoozed, settled } = layout;
  const inboxEmpty = inbox.nodes.length === 0;
  return (
    <nav
      aria-label="Threads"
      data-inbox-list=""
      className="flex min-h-full flex-col gap-px px-2 pb-2"
    >
      {pinned.nodes.length > 0 ? (
        <section aria-label="Pinned" data-inbox-section="pinned" className="flex flex-col gap-px">
          <SectionHeader>
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
      <div className="mt-auto flex flex-col gap-px pt-2">
        {working.nodes.length > 0 ? (
          <Shelf
            section="working"
            title="Working"
            nodes={working.nodes}
            threadCount={working.threadCount}
            activeThreadId={activeThreadId}
            context={context}
          />
        ) : null}
        {snoozed.nodes.length > 0 ? (
          <Shelf
            section="snoozed"
            title="Snoozed"
            nodes={snoozed.nodes}
            threadCount={snoozed.threadCount}
            activeThreadId={activeThreadId}
            context={context}
          />
        ) : null}
        {settled.nodes.length > 0 ? (
          <Shelf
            section="settled"
            title="Settled"
            nodes={settled.nodes}
            threadCount={settled.threadCount}
            activeThreadId={activeThreadId}
            context={context}
          />
        ) : null}
      </div>
    </nav>
  );
}
