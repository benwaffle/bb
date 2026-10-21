import { Fragment, type ReactNode } from "react";
import {
  experimental_Icon as RegisteredIcon,
  type ExperimentalResolvedSidebarThreadDecoration,
  type ExperimentalSidebarThreadGroupRowIcon,
  type PluginSidebarPullRequest,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { SidebarThread } from "../model/sidebar-thread.js";
import { useSidebarProjectName } from "../model/use-sidebar-data.js";
import { projectHueTextColor } from "./flatThreadRows.js";
import { TONE_TEXT_CLASS } from "./pluginThreadDecoration.js";

export interface ThreadRowSecondLineModel {
  project: { title: string; hue: number | null } | null;
  label: string | null;
  git:
    | {
        kind: "pullRequest";
        number: number;
        state: PluginSidebarPullRequest["state"];
      }
    | { kind: "branch"; name: string }
    | null;
}

const PULL_REQUEST_STATE_ICON: Record<
  PluginSidebarPullRequest["state"],
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
  showProject,
  projectDecoration,
  label,
  pullRequest,
}: {
  thread: SidebarThread;
  isOutsideProjectHeader: boolean;
  showProject: boolean;
  projectDecoration: ExperimentalResolvedSidebarThreadDecoration | null;
  label: string | null;
  pullRequest: PluginSidebarPullRequest | null;
}): ThreadRowSecondLineModel | null {
  const projectName = useSidebarProjectName(thread.projectId);
  const title = projectDecoration?.title ?? projectName ?? null;
  const project =
    isOutsideProjectHeader && showProject && title !== null
      ? { title, hue: projectDecoration?.hue ?? null }
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
  flat,
}: {
  icon: ExperimentalSidebarThreadGroupRowIcon;
  flat: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        flat ? "mr-0.5 inline-flex align-[-2px]" : "flex",
        "shrink-0",
        TONE_TEXT_CLASS[icon.tone],
      )}
    >
      <RegisteredIcon name={icon.name} fallback="Circle" className="size-3" />
    </span>
  );
}

export function ThreadRowSecondLine({
  line,
  flat,
}: {
  line: ThreadRowSecondLineModel;
  flat: boolean;
}) {
  const parts: { key: string; node: ReactNode }[] = [];
  if (line.project !== null) {
    parts.push({
      key: "project",
      node: (
        <span
          data-sidebar-thread-second-line-project=""
          data-sidebar-thread-second-line-project-hue={
            line.project.hue ?? undefined
          }
          className={cn(
            "min-w-0 shrink truncate",
            line.project.hue !== null && "font-medium",
          )}
          style={
            line.project.hue === null
              ? undefined
              : { color: projectHueTextColor(line.project.hue) }
          }
        >
          {line.project.title}
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
          className={cn(
            "max-w-24 shrink-0 truncate font-mono",
            flat && "text-eyebrow",
          )}
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
          className={cn(
            "shrink-0",
            flat ? "whitespace-nowrap" : "flex items-center gap-0.5",
          )}
        >
          <SecondLineIcon
            icon={PULL_REQUEST_STATE_ICON[line.git.state]}
            flat={flat}
          />
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
          className={cn(
            "min-w-0",
            flat ? "truncate" : "flex items-center gap-0.5",
          )}
          title={line.git.name}
        >
          <SecondLineIcon icon={BRANCH_ICON} flat={flat} />
          {flat ? (
            line.git.name
          ) : (
            <span className="min-w-0 truncate">{line.git.name}</span>
          )}
        </span>
      ),
    });
  }
  return (
    <span
      data-sidebar-thread-second-line=""
      className={cn(
        "pointer-events-none flex min-w-0 gap-1 text-subtle-foreground",
        flat
          ? "items-baseline whitespace-nowrap text-caption group-[.bb-sidebar-selected-row]/thread-row:text-muted-foreground"
          : "-mt-1 items-center text-xs",
      )}
    >
      {parts.map((part, index) => (
        <Fragment key={part.key}>
          {index === 0 ? null : (
            <span
              aria-hidden="true"
              className={cn("shrink-0", flat && "text-subtle-foreground/55")}
            >
              ·
            </span>
          )}
          {part.node}
        </Fragment>
      ))}
    </span>
  );
}
