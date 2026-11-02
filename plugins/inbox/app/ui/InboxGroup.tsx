import { memo, useState } from "react";
import { experimental_Icon as PluginIcon } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { SIDEBAR_ROW_INTERACTIVE_STATE_CLASS } from "@/components/ui/sidebar-row-classes";
import { cn } from "@/lib/utils";
import type { InboxGroupNode } from "../model/layout.js";
import { activeChangeAffects, sameGroupNode } from "../model/row-equality.js";
import { InboxThreadRow, type InboxRowContext } from "./InboxRow.js";
import { TicketLink } from "./TicketLink.js";

interface InboxGroupProps {
  node: InboxGroupNode;
  activeThreadId: string | null;
  context: InboxRowContext;
}

function sameGroupProps(previous: InboxGroupProps, next: InboxGroupProps): boolean {
  return (
    previous.context === next.context &&
    sameGroupNode(previous.node, next.node) &&
    !activeChangeAffects(next.node, previous.activeThreadId, next.activeThreadId)
  );
}

export const InboxGroup = memo(InboxGroupView, sameGroupProps);

function InboxGroupView({ node, activeThreadId, context }: InboxGroupProps) {
  const [open, setOpen] = useState(true);
  const { group, rows, placeholders } = node;
  const projectName = context.projectName(group.projectId);
  return (
    <div data-inbox-group={group.id} className="flex flex-col gap-px">
      <div
        className={cn(
          "relative flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground",
          SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-label={group.tooltip ?? group.label}
          title={group.tooltip ?? group.label}
          onClick={() => setOpen((value) => !value)}
          className="absolute inset-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        />
        <Icon
          name="ChevronRight"
          className={cn(
            "pointer-events-none size-3 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <PluginIcon
          name={group.icon ?? "Layers"}
          fallback="Layers"
          className="pointer-events-none size-3.5 shrink-0"
        />
        {group.keyLabel === undefined ? null : group.labelHref === undefined ? (
          <span className="pointer-events-none shrink-0 font-mono">
            {group.keyLabel}
          </span>
        ) : (
          <TicketLink
            href={group.labelHref}
            className="shrink-0 font-mono"
            data-inbox-group-key-link=""
          >
            {group.keyLabel}
          </TicketLink>
        )}
        <span className="pointer-events-none min-w-0 flex-1 truncate text-left">
          {group.keyLabel === undefined ? group.label : projectName}
        </span>
        <span className="pointer-events-none shrink-0 tabular-nums">
          {placeholders.length > 0
            ? `${rows.length}/${rows.length + placeholders.length}`
            : rows.length}
        </span>
      </div>
      {open ? (
        <div className="flex flex-col gap-px pl-2">
          {rows.map((row) => (
            <InboxThreadRow
              key={row.entry.thread.id}
              node={row}
              depth={0}
              activeThreadId={activeThreadId}
              context={context}
              groupKeyLabel={group.keyLabel ?? null}
            />
          ))}
          {placeholders.map((placeholder) => (
            <button
              key={placeholder.id}
              type="button"
              title={placeholder.tooltip ?? placeholder.title}
              onClick={() => placeholder.onSelect()}
              className={cn(
                "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground",
                SIDEBAR_ROW_INTERACTIVE_STATE_CLASS,
                placeholder.variant === "ghost" && "opacity-70",
              )}
            >
              {placeholder.icon === undefined ? null : (
                <PluginIcon
                  name={placeholder.icon.name}
                  fallback="Circle"
                  className="size-3.5 shrink-0"
                />
              )}
              <span className="min-w-0 flex-1 truncate text-left">
                {placeholder.title}
              </span>
              {placeholder.description === undefined ? null : (
                <span className="shrink-0 truncate">{placeholder.description}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
