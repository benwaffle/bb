import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  SNOOZE_PRESET_IDS,
  SNOOZE_PRESET_LABELS,
  formatWakeAt,
  formatWakeIn,
  snoozePresetTime,
} from "../../shared/inbox-state.js";
import {
  openSnoozePicker,
  settleThread,
  snoozeThread,
  unsettleThread,
} from "../model/inbox-actions.js";
import type { InboxSection } from "../model/layout.js";
import type { InboxStatus } from "../model/status.js";
import { STATUS_COLORS } from "./StatusGlyph.js";

type ActionGlyphName = "clock" | "check" | "alarm" | "undo";

const ACTION_GLYPH_PATHS: Record<ActionGlyphName, ReactNode> = {
  clock: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  alarm: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M5 3 2 6" />
      <path d="m22 6-3-3" />
      <path d="M6.38 18.7 4 21" />
      <path d="M17.64 18.67 20 21" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />
    </>
  ),
};

export function ActionGlyph({
  name,
  className,
}: {
  name: ActionGlyphName;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-3.5 shrink-0", className)}
    >
      {ACTION_GLYPH_PATHS[name]}
    </svg>
  );
}

const SETTLEABLE_STATUSES: ReadonlySet<InboxStatus> = new Set([
  "done",
  "idle",
  "failed",
  "background",
]);

export function canParkFromRow(section: InboxSection, status: InboxStatus): boolean {
  if (section === "settled" || section === "snoozed") return false;
  return SETTLEABLE_STATUSES.has(status);
}

function report(action: string, promise: Promise<void>): void {
  promise.catch((error: unknown) => {
    console.error(`Inbox: could not ${action}`, error);
  });
}

function stop(event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

const ACTION_BUTTON_CLASS =
  "inline-flex h-5 items-center gap-1 rounded-[5px] px-1.5 text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring";

function SnoozeMenu({
  threadId,
  onOpenChange,
}: {
  threadId: string;
  onOpenChange(open: boolean): void;
}) {
  const [now, setNow] = useState(0);
  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (open) setNow(Date.now());
        onOpenChange(open);
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Snooze"
          title="Snooze"
          className={ACTION_BUTTON_CLASS}
          onClick={(event) => event.stopPropagation()}
        >
          <ActionGlyph name="clock" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        {SNOOZE_PRESET_IDS.map((preset) => {
          const until = snoozePresetTime(preset, now);
          return (
            <DropdownMenuItem
              key={preset}
              onSelect={() => report("snooze", snoozeThread(threadId, until))}
            >
              <span className="flex-1">{SNOOZE_PRESET_LABELS[preset]}</span>
              <span className="text-xs text-muted-foreground">
                {formatWakeAt(until)}
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openSnoozePicker(threadId)}>
          Pick a time…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function RowActions({
  threadId,
  section,
  onMenuOpenChange,
  menuOpen,
}: {
  threadId: string;
  section: InboxSection;
  onMenuOpenChange(open: boolean): void;
  menuOpen: boolean;
}) {
  const parked = section === "settled" || section === "snoozed";
  return (
    <span
      data-inbox-row-actions=""
      className={cn(
        "pointer-events-auto relative z-10 -mr-1.5 ml-auto hidden shrink-0 items-center",
        "group-hover/inbox-row:inline-flex group-focus-within/inbox-row:inline-flex",
        menuOpen && "inline-flex",
      )}
    >
      <SnoozeMenu threadId={threadId} onOpenChange={onMenuOpenChange} />
      {parked ? (
        <button
          type="button"
          className={ACTION_BUTTON_CLASS}
          onClick={(event) => {
            stop(event);
            report("unsettle", unsettleThread(threadId));
          }}
        >
          <ActionGlyph name="undo" />
          {section === "snoozed" ? "Wake" : "Unsettle"}
        </button>
      ) : (
        <button
          type="button"
          className={ACTION_BUTTON_CLASS}
          onClick={(event) => {
            stop(event);
            report("settle", settleThread(threadId));
          }}
        >
          <ActionGlyph name="check" />
          Settle
        </button>
      )}
    </span>
  );
}

function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function WakeSlot({ until }: { until: number }) {
  const now = useMinuteClock();
  return (
    <span
      title={`Wakes ${formatWakeAt(until)}`}
      className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs tabular-nums"
      style={{ color: STATUS_COLORS.working }}
    >
      <ActionGlyph name="alarm" className="size-4" />
      {formatWakeIn(until, now)}
    </span>
  );
}
