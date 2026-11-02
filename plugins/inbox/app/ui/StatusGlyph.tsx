import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { InboxStatus } from "../model/status.js";
import { useElapsedNow, useMinuteNow } from "./InboxClock.js";

type GlyphStatus = Exclude<InboxStatus, "idle">;

const GLYPH_PATHS: Record<GlyphStatus | "fork", ReactNode> = {
  approval: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  ),
  input: (
    <>
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </>
  ),
  working: (
    <>
      <path d="M10.1 2.18a9.93 9.93 0 0 1 3.8 0" />
      <path d="M17.6 3.71a9.95 9.95 0 0 1 2.69 2.7" />
      <path d="M21.82 10.1a9.93 9.93 0 0 1 0 3.8" />
      <path d="M20.29 17.6a9.95 9.95 0 0 1-2.7 2.69" />
      <path d="M13.9 21.82a9.94 9.94 0 0 1-3.8 0" />
      <path d="M6.4 20.29a9.95 9.95 0 0 1-2.69-2.7" />
      <path d="M2.18 13.9a9.93 9.93 0 0 1 0-3.8" />
      <path d="M3.71 6.4a9.95 9.95 0 0 1 2.7-2.69" />
    </>
  ),
  background: (
    <>
      <rect width="18" height="18" x="3" y="3" rx="2" />
      <path d="m7 11 2-2-2-2" />
      <path d="M11 13h4" />
    </>
  ),
  done: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  failed: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </>
  ),
  fork: (
    <>
      <circle cx="12" cy="18" r="3" />
      <circle cx="6" cy="6" r="3" />
      <circle cx="18" cy="6" r="3" />
      <path d="M18 9v2c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1V9" />
      <path d="M12 12v3" />
    </>
  ),
};

export const STATUS_LABELS: Record<GlyphStatus, string> = {
  approval: "Approval",
  input: "Input",
  working: "Working",
  background: "Background",
  done: "Done",
  failed: "Failed",
};

export const STATUS_COLORS: Record<GlyphStatus, string> = {
  approval: "var(--attention)",
  input: "oklch(from var(--success) l 0.12 275)",
  working: "oklch(from var(--success) l 0.1 235)",
  background: "oklch(from var(--success) l 0.1 235)",
  done: "var(--success)",
  failed: "var(--destructive-text)",
};

export function GlyphIcon({
  name,
  className,
  style,
}: {
  name: GlyphStatus | "fork";
  className?: string;
  style?: CSSProperties;
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
      className={cn("shrink-0", className)}
      style={style}
    >
      {GLYPH_PATHS[name]}
    </svg>
  );
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function formatRelativeTime(at: number, now: number): string {
  const elapsed = now - at;
  if (elapsed < 60_000) return "now";
  return formatElapsed(elapsed);
}

function WorkingDuration({ since }: { since: number }) {
  const now = useElapsedNow(since);
  return (
    <span className="inline-block min-w-[3ch] text-left font-normal tabular-nums text-muted-foreground">
      {formatElapsed(now - since)}
    </span>
  );
}

export function RelativeTime({ at }: { at: number }) {
  const now = useMinuteNow();
  return (
    <span className="tabular-nums text-muted-foreground">
      {formatRelativeTime(at, now)}
    </span>
  );
}

export function StatusSlot({
  status,
  workingSince,
  timeAt,
}: {
  status: InboxStatus;
  workingSince: number | null;
  timeAt: number;
}) {
  if (status === "idle") {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center text-xs">
        <RelativeTime at={timeAt} />
      </span>
    );
  }
  return (
    <span
      data-inbox-status={status}
      className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums"
      style={{ color: STATUS_COLORS[status] }}
    >
      <GlyphIcon
        name={status}
        className={cn(
          "size-4",
          status === "working" &&
            "motion-safe:animate-[spin_2.4s_linear_infinite] motion-safe:will-change-transform",
        )}
      />
      {STATUS_LABELS[status]}
      {status === "working" && workingSince !== null ? (
        <WorkingDuration since={workingSince} />
      ) : null}
    </span>
  );
}
