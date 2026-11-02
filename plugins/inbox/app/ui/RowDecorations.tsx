import type { CSSProperties } from "react";
import {
  experimental_Icon as PluginIcon,
  type ExperimentalSidebarThreadGroupRowIcon,
  type ExperimentalSidebarThreadGroupRowTrailing,
  type ExperimentalSidebarThreadGroupTone,
  type ExperimentalSidebarThreadRowPullRequest,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

type PullRequestState = ExperimentalSidebarThreadRowPullRequest["state"];

const TONE_COLORS: Record<ExperimentalSidebarThreadGroupTone, string | undefined> = {
  success: "var(--success)",
  muted: undefined,
  accent: "oklch(from var(--success) l 0.14 300)",
  danger: "var(--destructive-text)",
};

const PULL_REQUEST_STATES: Record<
  PullRequestState,
  { icon: string; tone: ExperimentalSidebarThreadGroupTone; label: string }
> = {
  open: { icon: "GitPullRequest", tone: "success", label: "Open" },
  draft: { icon: "GitPullRequestDraft", tone: "muted", label: "Draft" },
  merged: { icon: "GitMerge", tone: "accent", label: "Merged" },
  closed: { icon: "GitPullRequestClosed", tone: "danger", label: "Closed" },
};

function toneStyle(tone: ExperimentalSidebarThreadGroupTone): CSSProperties | undefined {
  const color = TONE_COLORS[tone];
  return color === undefined ? undefined : { color };
}

export function PullRequestBadge({
  pullRequest,
}: {
  pullRequest: ExperimentalSidebarThreadRowPullRequest;
}) {
  const state = PULL_REQUEST_STATES[pullRequest.state];
  return (
    <span
      data-inbox-row-pull-request={pullRequest.number}
      data-inbox-row-pull-request-state={pullRequest.state}
      title={`${state.label} pull request #${pullRequest.number}`}
      className="inline-flex shrink-0 items-center gap-0.5 font-medium tabular-nums"
      style={toneStyle(state.tone)}
    >
      <PluginIcon name={state.icon} fallback="GitPullRequest" className="size-3.5" />
      #{pullRequest.number}
    </span>
  );
}

export function RowIcon({ icon }: { icon: ExperimentalSidebarThreadGroupRowIcon }) {
  return (
    <span
      data-inbox-row-icon={icon.name}
      data-inbox-row-icon-tone={icon.tone}
      className="inline-flex shrink-0"
      style={toneStyle(icon.tone)}
    >
      <PluginIcon name={icon.name} fallback="Circle" className="size-3.5" />
    </span>
  );
}

export function RowTrailing({
  trailing,
}: {
  trailing: ExperimentalSidebarThreadGroupRowTrailing;
}) {
  if (trailing.kind === "text") {
    return (
      <span data-inbox-row-trailing="text" className="shrink-0 truncate">
        {trailing.text}
      </span>
    );
  }
  return (
    <span
      data-inbox-row-trailing="dot"
      data-inbox-row-trailing-tone={trailing.tone}
      aria-hidden="true"
      className={cn(
        "size-1.5 shrink-0 rounded-full bg-current",
        trailing.tone === "muted" && "opacity-60",
      )}
      style={toneStyle(trailing.tone)}
    />
  );
}
