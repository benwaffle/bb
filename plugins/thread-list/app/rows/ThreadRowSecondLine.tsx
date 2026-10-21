import { Fragment, type ReactNode } from "react";
import {
  experimental_Icon as RegisteredIcon,
  type ExperimentalResolvedSidebarThreadDecoration,
  type ExperimentalSidebarThreadGroupRowIcon,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { SidebarThread } from "../model/sidebar-thread.js";
import type { ThreadRowPullRequest } from "./githubPrStatus.js";
import { useSidebarProjectName } from "../model/use-sidebar-data.js";
import { TONE_TEXT_CLASS } from "./pluginThreadDecoration.js";

export interface ThreadRowSecondLineModel {
  project: { leading: string | null; title: string | null } | null;
  label: string | null;
  git:
    | {
        kind: "pullRequest";
        number: number;
        state: ThreadRowPullRequest["state"];
      }
    | { kind: "branch"; name: string }
    | null;
}

const PULL_REQUEST_STATE_ICON: Record<
  ThreadRowPullRequest["state"],
  ExperimentalSidebarThreadGroupRowIcon
> = {
  open: { name: "GitPullRequestArrow", tone: "success" },
  draft: { name: "GitPullRequestDraft", tone: "muted" },
  merged: { name: "GitMerge", tone: "accent" },
  closed: { name: "GitPullRequestClosed", tone: "danger" },
};

const BRANCH_ICON: ExperimentalSidebarThreadGroupRowIcon = {
  name: "GitBranch",
  tone: "muted",
};

export function useThreadRowSecondLine({
  thread,
  isOutsideProjectHeader,
  projectDecoration,
  label,
  pullRequest,
}: {
  thread: SidebarThread;
  isOutsideProjectHeader: boolean;
  projectDecoration: ExperimentalResolvedSidebarThreadDecoration | null;
  label: string | null;
  pullRequest: ThreadRowPullRequest | null;
}): ThreadRowSecondLineModel | null {
  const projectName = useSidebarProjectName(thread.projectId);
  const leading = projectDecoration?.leading ?? null;
  const title = projectDecoration?.title ?? projectName ?? null;
  const project =
    isOutsideProjectHeader && (leading !== null || title !== null)
      ? { leading, title }
      : null;
  const branchName = thread.environment?.branchName ?? null;
  const git: ThreadRowSecondLineModel["git"] =
    pullRequest !== null
      ? {
          kind: "pullRequest",
          number: pullRequest.number,
          state: pullRequest.state,
        }
      : branchName
        ? { kind: "branch", name: branchName }
        : null;
  const shownLabel = isOutsideProjectHeader ? label : null;
  if (project === null && shownLabel === null && git === null) return null;
  return { project, label: shownLabel, git };
}

function SecondLineIcon({
  icon,
}: {
  icon: ExperimentalSidebarThreadGroupRowIcon;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex shrink-0", TONE_TEXT_CLASS[icon.tone])}
    >
      <RegisteredIcon name={icon.name} fallback="Circle" className="size-3" />
    </span>
  );
}

export function ThreadRowSecondLine({
  line,
}: {
  line: ThreadRowSecondLineModel;
}) {
  const parts: { key: string; node: ReactNode }[] = [];
  if (line.project !== null) {
    parts.push({
      key: "project",
      node: (
        <span
          data-sidebar-thread-second-line-project=""
          className="flex min-w-0 shrink items-center gap-1"
        >
          {line.project.leading === null ? null : (
            <span className="max-w-8 shrink-0 truncate">
              {line.project.leading}
            </span>
          )}
          {line.project.title === null ? null : (
            <span className="min-w-0 truncate">{line.project.title}</span>
          )}
        </span>
      ),
    });
  }
  if (line.label !== null) {
    parts.push({
      key: "label",
      node: (
        <span
          data-sidebar-thread-second-line-label=""
          className="max-w-24 shrink-0 truncate font-mono"
        >
          {line.label}
        </span>
      ),
    });
  }
  if (line.git?.kind === "pullRequest") {
    parts.push({
      key: "git",
      node: (
        <span
          data-sidebar-thread-second-line-pull-request={line.git.state}
          className="flex shrink-0 items-center gap-0.5"
        >
          <SecondLineIcon icon={PULL_REQUEST_STATE_ICON[line.git.state]} />
          {`#${line.git.number}`}
        </span>
      ),
    });
  } else if (line.git?.kind === "branch") {
    parts.push({
      key: "git",
      node: (
        <span
          data-sidebar-thread-second-line-branch=""
          className="flex min-w-0 items-center gap-0.5"
          title={line.git.name}
        >
          <SecondLineIcon icon={BRANCH_ICON} />
          <span className="min-w-0 truncate">{line.git.name}</span>
        </span>
      ),
    });
  }
  return (
    <span
      data-sidebar-thread-second-line=""
      className="pointer-events-none -mt-1 flex min-w-0 items-center gap-1 text-xs text-subtle-foreground"
    >
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index === 0 ? null : (
            <span aria-hidden="true" className="shrink-0">
              ·
            </span>
          )}
          {part.node}
        </Fragment>
      ))}
    </span>
  );
}
