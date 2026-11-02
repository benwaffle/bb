import { memo, useState, type CSSProperties } from "react";
import {
  experimental_ProviderIcon as ProviderIcon,
  experimental_ThreadActionsContextMenu as ThreadActionsContextMenu,
  experimental_useSidebarProjectDecoration as useSidebarProjectDecoration,
  experimental_useSidebarThreadDecoration as useSidebarThreadDecoration,
  experimental_useSidebarThreadRowDecoration as useSidebarThreadRowDecoration,
  ThreadTitle,
  useSidebarThreadShortcut,
  type PluginSidebarThread,
  type PluginProvidersState,
  type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";
import { ShortcutPill } from "@/components/ui/shortcut-pill";
import {
  SIDEBAR_ROW_ACCENT_STATE_CLASS,
  SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
  SIDEBAR_ROW_SELECTED_STATE_CLASS,
} from "@/components/ui/sidebar-row-classes";
import { cn } from "@/lib/utils";
import type { InboxThreadNode } from "../model/layout.js";
import { activeChangeAffects, sameThreadNode } from "../model/row-equality.js";
import { ProjectIcon } from "./ProjectIcon.js";
import { PullRequestBadge, RowIcon, RowTrailing } from "./RowDecorations.js";
import { canParkFromRow, RowActions, WakeSlot } from "./RowActions.js";
import { GlyphIcon, RelativeTime, StatusSlot } from "./StatusGlyph.js";
import { TicketLink } from "./TicketLink.js";

type ProviderInfo = PluginProvidersState["providers"][number];

export interface InboxRowContext {
  onNavigate(): void;
  projectName(projectId: string): string | null;
  projectIconUrl(projectId: string): string | null;
  provider(providerId: string): ProviderInfo | null;
  defaultHostName: string | null;
}

function toActionTarget(thread: PluginSidebarThread): PluginThreadActionTarget {
  return {
    id: thread.id,
    projectId: thread.projectId,
    parentThreadId: thread.parentThreadId,
    parentNotifications: thread.parentNotifications,
    archivedAt: thread.archivedAt,
    pinnedAt: thread.pinnedAt,
    sectionId: thread.sectionId,
    isUnread: thread.isUnread,
    status: thread.status,
    environment:
      thread.environment?.id == null
        ? null
        : { id: thread.environment.id, path: thread.environment.path },
  };
}

function branchLine(
  thread: PluginSidebarThread,
  defaultHostName: string | null,
): string | null {
  const branch = thread.environment?.branchName ?? null;
  if (branch !== null) return branch;
  const host = thread.host?.name ?? null;
  if (host !== null && host !== defaultHostName) return host;
  return host === null ? (thread.environment?.name ?? null) : null;
}

const CHILD_INDENT_PX = 14;

interface InboxThreadRowProps {
  node: InboxThreadNode;
  depth: number;
  activeThreadId: string | null;
  context: InboxRowContext;
  groupKeyLabel?: string | null;
}

function sameRowProps(
  previous: InboxThreadRowProps,
  next: InboxThreadRowProps,
): boolean {
  return (
    previous.depth === next.depth &&
    previous.context === next.context &&
    previous.groupKeyLabel === next.groupKeyLabel &&
    sameThreadNode(previous.node, next.node) &&
    !activeChangeAffects(next.node, previous.activeThreadId, next.activeThreadId)
  );
}

export const InboxThreadRow = memo(InboxThreadRowView, sameRowProps);

function InboxThreadRowView({
  node,
  depth,
  activeThreadId,
  context,
  groupKeyLabel = null,
}: InboxThreadRowProps) {
  const [childrenOpen, setChildrenOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { entry, children, detachedFrom } = node;
  const { thread, status, section, parked } = entry;
  const isParkedRow = section === "settled" || section === "snoozed";
  const showActions = isParkedRow || canParkFromRow(section, status);
  const shortcut = useSidebarThreadShortcut(thread.id);
  const isActive = activeThreadId === thread.id;
  const projectDecoration = useSidebarProjectDecoration(thread.projectId);
  const projectRowDecoration = useSidebarThreadDecoration(thread.projectId);
  const projectName =
    context.projectName(thread.projectId) ??
    projectRowDecoration?.title ??
    "Project";
  const projectIconUrl = context.projectIconUrl(thread.projectId);
  const provider = context.provider(thread.providerId);
  const branch = branchLine(thread, context.defaultHostName);
  const decoration = useSidebarThreadRowDecoration(thread.id, thread.projectId);
  const ticket =
    decoration?.label != null && decoration.label !== groupKeyLabel
      ? { label: decoration.label, href: decoration.labelHref }
      : null;
  const description = decoration?.description ?? null;
  const isRead = !thread.isUnread;
  const isWorking = status === "working" || status === "background";
  const rowStyle: CSSProperties | undefined =
    depth > 0 ? { paddingLeft: 10 + depth * CHILD_INDENT_PX } : undefined;

  const leading =
    projectIconUrl === null && projectDecoration?.leading != null ? (
      <span
        data-inbox-row-project-leading=""
        className="pointer-events-auto relative z-10 inline-flex size-4 shrink-0 items-center justify-center"
      >
        {projectDecoration.leading}
      </span>
    ) : projectIconUrl === null && projectRowDecoration?.leading != null ? (
      <span
        aria-hidden="true"
        data-inbox-row-project-leading=""
        className="inline-flex size-4 shrink-0 items-center justify-center text-sm leading-none"
      >
        {projectRowDecoration.leading}
      </span>
    ) : (
      <ProjectIcon name={projectName} iconUrl={projectIconUrl} />
    );

  const row = (
    <div
      data-inbox-row=""
      data-inbox-thread-id={thread.id}
      data-inbox-row-status={status}
      className={cn(
        "group/inbox-row relative flex w-full flex-col rounded-md px-2.5 py-[3px] transition-[background-color,opacity] duration-150",
        isActive
          ? cn(SIDEBAR_ROW_SELECTED_STATE_CLASS, "ring-1 ring-inset ring-sidebar-border")
          : SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
        SIDEBAR_ROW_ACCENT_STATE_CLASS,
        isWorking && !isActive && !isParkedRow && "opacity-70 hover:opacity-100",
      )}
      style={rowStyle}
    >
      <a
        href={thread.href}
        draggable={false}
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        aria-label={thread.displayTitle}
        aria-current={isActive ? "page" : undefined}
        aria-keyshortcuts={shortcut?.ariaKeyshortcuts}
        onClick={() => context.onNavigate()}
        className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      />
      <span className="pointer-events-none flex h-5 min-w-0 items-center gap-1.5">
        {leading}
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-medium text-foreground transition-colors",
            isRead && "text-foreground/85 group-hover/inbox-row:text-foreground",
            isParkedRow &&
              "font-normal text-muted-foreground/70 group-hover/inbox-row:text-foreground",
          )}
        >
          <ThreadTitle threadId={thread.id} />
        </span>
        {shortcut ? (
          <ShortcutPill shortcut={shortcut} />
        ) : (
          <>
            <span className="ml-auto inline-flex shrink-0 items-center">
              {section === "snoozed" && parked?.snoozeUntil != null ? (
                <WakeSlot until={parked.snoozeUntil} />
              ) : section === "settled" && parked !== null ? (
                <span className="inline-flex items-center text-xs">
                  <RelativeTime at={parked.settledAt} />
                </span>
              ) : (
                <StatusSlot
                  status={status}
                  workingSince={entry.workingSince}
                  timeAt={entry.returnAt}
                />
              )}
            </span>
          </>
        )}
      </span>
      <span className="pointer-events-none relative mt-px flex h-4 min-w-0 items-center gap-1.5 pl-[22px] text-xs text-subtle-foreground">
        {showActions && !shortcut ? (
          <RowActions
            threadId={thread.id}
            section={section}
            pinned={thread.pinnedAt !== null}
            menuOpen={menuOpen}
            onMenuOpenChange={setMenuOpen}
          />
        ) : null}
        <span
          data-inbox-row-project-name=""
          className="max-w-[55%] shrink-0 truncate text-muted-foreground"
        >
          {projectName}
        </span>
        {detachedFrom !== null ? (
          <span
            className="inline-flex min-w-0 shrink items-center gap-1"
            title={`From ${detachedFrom.title}`}
          >
            <span aria-hidden="true">·</span>
            <GlyphIcon name="fork" className="size-3" />
            <span className="truncate">from {detachedFrom.title}</span>
          </span>
        ) : null}
        {ticket === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            {ticket.href === null ? (
              <span className="shrink-0 font-mono">{ticket.label}</span>
            ) : (
              <TicketLink
                href={ticket.href}
                className="shrink-0 font-mono"
                data-inbox-row-ticket-link=""
              >
                {ticket.label}
              </TicketLink>
            )}
          </>
        )}
        {description !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span
              data-inbox-row-description=""
              className="min-w-0 flex-1 truncate"
              title={branch ?? undefined}
            >
              {description}
            </span>
          </>
        ) : branch !== null ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 flex-1 truncate tabular-nums" title={branch}>
              {branch}
            </span>
          </>
        ) : (
          <span className="flex-1" />
        )}
        {children.length > 0 ? (
          <button
            type="button"
            aria-expanded={childrenOpen}
            aria-label={`${childrenOpen ? "Hide" : "Show"} ${children.length} child ${children.length === 1 ? "thread" : "threads"}`}
            title={`${children.length} child ${children.length === 1 ? "thread" : "threads"}`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setChildrenOpen((open) => !open);
            }}
            className={cn(
              "pointer-events-auto relative z-10 inline-flex h-4 shrink-0 items-center rounded-sm px-1 tabular-nums text-muted-foreground ring-1 ring-inset ring-sidebar-border hover:bg-state-hover hover:text-sidebar-foreground",
              childrenOpen && "bg-state-active text-sidebar-foreground",
            )}
          >
            {children.length} {children.length === 1 ? "child" : "children"}
          </button>
        ) : null}
        {decoration?.trailing != null ? (
          <RowTrailing trailing={decoration.trailing} />
        ) : null}
        {decoration?.pullRequest != null ? (
          <PullRequestBadge pullRequest={decoration.pullRequest} />
        ) : null}
        {decoration?.icon != null ? (
          <span className="ml-auto inline-flex shrink-0">
            <RowIcon icon={decoration.icon} />
          </span>
        ) : provider !== null ? (
          <span className="ml-auto inline-flex shrink-0 opacity-50 grayscale">
            <ProviderIcon
              providerKind="agent"
              provider={provider}
              className="size-3.5"
            />
          </span>
        ) : null}
      </span>
    </div>
  );

  return (
    <>
      <ThreadActionsContextMenu thread={toActionTarget(thread)}>
        {row}
      </ThreadActionsContextMenu>
      {childrenOpen
        ? children.map((child) => (
            <InboxThreadRow
              key={child.entry.thread.id}
              node={child}
              depth={depth + 1}
              activeThreadId={activeThreadId}
              context={context}
            />
          ))
        : null}
    </>
  );
}
