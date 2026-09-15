import { useRef, useState, type ReactNode } from "react";
import { isBackgroundAgentTaskType } from "@bb/domain";
import type { TimelineWorkflowWorkRow } from "@bb/server-contract";
import { useResizeObserver } from "usehooks-ts";
import { AnimatedBody } from "@/components/promptbox/banner/AnimatedBody";
import {
  PROMPT_STACK_CARD_HEADER_BUTTON_CLASS,
  PROMPT_STACK_CARD_ROW_HEIGHT,
  PromptStackCard,
  PromptStackCardChevron,
} from "@/components/promptbox/banner/PromptStackCard";
import { LiveDurationText } from "@/components/thread/timeline/LiveDurationText";
import { Icon } from "@bb/shared-ui/icon";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import {
  activityIconClass,
  activityMetaClass,
  activityRowClass,
  activityTextClass,
} from "@bb/shared-ui/activity-row-styles";
import { cn } from "@bb/shared-ui/lib/utils";

const BODY_ID = "thread-background-commands-card-body";
const TOGGLE_ID = "thread-background-commands-card-toggle";
const STOP_BUTTON_CLASS =
  "flex min-h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-none border-l border-border/35 bg-transparent text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:text-muted-foreground/60";
const ROW_STOP_BUTTON_CLASS =
  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-transparent text-muted-foreground transition-colors hover:text-foreground disabled:cursor-wait disabled:text-muted-foreground/60";
const COMPACT_PROMPT_SHELL_MAX_WIDTH_REM = 34;
const DEFAULT_ROOT_FONT_SIZE_PX = 16;

function isCompactPromptShellWidth(width: number): boolean {
  const parsedRootFontSize =
    typeof window === "undefined"
      ? Number.NaN
      : Number.parseFloat(
          window.getComputedStyle(document.documentElement).fontSize,
        );
  const rootFontSize = Number.isFinite(parsedRootFontSize)
    ? parsedRootFontSize
    : DEFAULT_ROOT_FONT_SIZE_PX;
  return width <= COMPACT_PROMPT_SHELL_MAX_WIDTH_REM * rootFontSize;
}

interface BackgroundActivityDisplay {
  icon: "Terminal" | "UserRoundPlus";
  label: string;
  runningPrefix: string;
}

function backgroundActivityDisplay(
  row: TimelineWorkflowWorkRow,
): BackgroundActivityDisplay {
  if (isBackgroundAgentTaskType(row.taskType)) {
    return {
      icon: "UserRoundPlus",
      label: "Background agent",
      runningPrefix: "Running background agent:",
    };
  }
  return {
    icon: "Terminal",
    label: "Background command",
    runningPrefix: "Running background command:",
  };
}

function backgroundActivityGroupLabel(
  rows: readonly TimelineWorkflowWorkRow[],
): string {
  const hasAgent = rows.some((row) => isBackgroundAgentTaskType(row.taskType));
  const hasCommand = rows.some(
    (row) => !isBackgroundAgentTaskType(row.taskType),
  );
  if (hasAgent && hasCommand) {
    return "Background activity";
  }
  return hasAgent ? "Background agents" : "Background commands";
}

function backgroundActivityModel(row: TimelineWorkflowWorkRow): string | null {
  return isBackgroundAgentTaskType(row.taskType) ? row.model : null;
}

function backgroundActivityText(row: TimelineWorkflowWorkRow): string {
  if (isBackgroundAgentTaskType(row.taskType)) {
    return row.description;
  }
  return row.command ?? row.description;
}

function backgroundActivityAriaLabel(
  row: TimelineWorkflowWorkRow,
  label = backgroundActivityDisplay(row).label,
): string {
  const model = backgroundActivityModel(row);
  const text = backgroundActivityText(row);
  return model ? `${label}: ${text} · Model ${model}` : `${label}: ${text}`;
}

const OUTPUT_TAIL_LINES = 8;

function backgroundCommandOutputTail(
  row: TimelineWorkflowWorkRow,
): string | null {
  if (isBackgroundAgentTaskType(row.taskType)) {
    return null;
  }
  const output = row.output?.replace(/\s+$/u, "") ?? "";
  if (output.length === 0) {
    return null;
  }
  return output.split("\n").slice(-OUTPUT_TAIL_LINES).join("\n");
}

function BackgroundCommandOutputTail({
  row,
}: {
  row: TimelineWorkflowWorkRow;
}) {
  const tail = backgroundCommandOutputTail(row);
  if (tail === null) {
    return null;
  }
  return (
    <pre
      aria-label="Background command output"
      className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-card px-2 py-1 font-mono text-2xs leading-tight text-muted-foreground"
    >
      {tail}
    </pre>
  );
}

function stopBackgroundCommandAriaLabel(row: TimelineWorkflowWorkRow): string {
  return `Stop background command: ${backgroundActivityText(row)}`;
}

function isStoppableBackgroundCommand(row: TimelineWorkflowWorkRow): boolean {
  return (
    !isBackgroundAgentTaskType(row.taskType) &&
    row.familyId !== null &&
    row.status === "pending"
  );
}

function StopBackgroundCommandButton({
  row,
  className,
  isStopping,
  onStop,
}: {
  row: TimelineWorkflowWorkRow;
  className: string;
  isStopping: boolean;
  onStop: (row: TimelineWorkflowWorkRow) => void;
}) {
  return (
    <button
      type="button"
      aria-label={stopBackgroundCommandAriaLabel(row)}
      title="Stop this command"
      onClick={() => onStop(row)}
      disabled={isStopping}
      className={className}
    >
      <Icon
        name={isStopping ? "Loading" : "Square"}
        className={cn("size-3", isStopping && "animate-spin")}
        aria-hidden="true"
      />
    </button>
  );
}

function compactBackgroundActivityLabel(
  rows: readonly TimelineWorkflowWorkRow[],
): string {
  const agentCount = rows.filter((row) =>
    isBackgroundAgentTaskType(row.taskType),
  ).length;
  const commandCount = rows.length - agentCount;
  if (commandCount === 0) {
    return `Running ${agentCount} background agent${agentCount === 1 ? "" : "s"}`;
  }
  if (agentCount === 0) {
    return `Running ${commandCount} background command${commandCount === 1 ? "" : "s"}`;
  }
  return `Running ${rows.length} background activities`;
}

function BackgroundActivitySummary({
  row,
  showDuration,
  showFullCommand = false,
}: {
  row: TimelineWorkflowWorkRow;
  showDuration: boolean;
  showFullCommand?: boolean;
}) {
  const display = backgroundActivityDisplay(row);
  const model = backgroundActivityModel(row);
  const text = backgroundActivityText(row);
  const wrapsCommand =
    showFullCommand &&
    !isBackgroundAgentTaskType(row.taskType) &&
    row.command !== null;
  return (
    <span
      className={cn(
        "flex min-w-0 flex-1 gap-1 text-left",
        wrapsCommand ? "items-start" : "items-center",
      )}
    >
      <span
        className={cn(
          "shrink-0 whitespace-nowrap",
          activityMetaClass("active"),
        )}
      >
        {display.runningPrefix}
      </span>
      <span
        className={cn(
          "min-w-0",
          wrapsCommand
            ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
            : "truncate",
          !isBackgroundAgentTaskType(row.taskType) && row.command !== null
            ? "font-mono"
            : undefined,
          activityTextClass("active"),
        )}
        title={text}
      >
        {text}
      </span>
      {model ? (
        <span
          className={cn(
            "shrink-0 whitespace-nowrap font-mono text-2xs",
            activityMetaClass("active"),
          )}
          title={`Model: ${model}`}
        >
          {model}
        </span>
      ) : null}
      {showDuration ? (
        <span
          className={cn("shrink-0 tabular-nums", activityMetaClass("active"))}
        >
          <LiveDurationText startedAt={row.startedAt} />
        </span>
      ) : null}
    </span>
  );
}

interface ThreadBackgroundCommandsCardProps {
  commands: TimelineWorkflowWorkRow[];
  isExpanded: boolean;
  onToggle: () => void;
  onStopCommand?: (row: TimelineWorkflowWorkRow) => void;
  stoppingTaskId?: string | null;
}

export function ThreadBackgroundCommandsCard({
  commands,
  isExpanded,
  onToggle,
  onStopCommand,
  stoppingTaskId = null,
}: ThreadBackgroundCommandsCardProps) {
  const isCompactViewport = useIsCompactViewport();
  const cardRef = useRef<HTMLElement>(null!);
  const [isCompactCard, setIsCompactCard] = useState<boolean | null>(null);
  useResizeObserver({
    ref: cardRef,
    box: "border-box",
    onResize: ({ width }) => {
      if (width === undefined) return;
      const nextIsCompact = isCompactPromptShellWidth(width);
      setIsCompactCard((previous) =>
        previous === nextIsCompact ? previous : nextIsCompact,
      );
    },
  });
  const primary = commands[0];
  if (!primary) {
    return null;
  }
  const others = commands.slice(1);
  const hasMore = others.length > 0;
  const useCompactSummary = isCompactCard ?? isCompactViewport;
  const hasFullCommandToReveal = commands.some(
    (row) => !isBackgroundAgentTaskType(row.taskType) && row.command !== null,
  );
  const canExpand = hasMore || useCompactSummary || hasFullCommandToReveal;
  const expandedRows = useCompactSummary ? commands : others;
  const compactLabel = compactBackgroundActivityLabel(commands);
  const primaryDisplay = backgroundActivityDisplay(primary);
  const groupLabel = backgroundActivityGroupLabel(commands);
  const isStopping = (row: TimelineWorkflowWorkRow): boolean =>
    stoppingTaskId !== null && row.familyId === stoppingTaskId;
  const stopButtonFor = (
    row: TimelineWorkflowWorkRow,
    className: string,
  ): ReactNode =>
    onStopCommand && isStoppableBackgroundCommand(row) ? (
      <StopBackgroundCommandButton
        row={row}
        className={className}
        isStopping={isStopping(row)}
        onStop={onStopCommand}
      />
    ) : null;

  return (
    <PromptStackCard
      rootRef={cardRef}
      ariaLabel={groupLabel}
      className="overflow-hidden"
      style={{ minHeight: PROMPT_STACK_CARD_ROW_HEIGHT }}
    >
      <div className="flex items-center">
        {canExpand ? (
          <button
            type="button"
            id={TOGGLE_ID}
            aria-expanded={isExpanded}
            aria-controls={BODY_ID}
            aria-label={
              useCompactSummary
                ? compactLabel
                : backgroundActivityAriaLabel(primary, groupLabel)
            }
            onClick={onToggle}
            className={activityRowClass(
              "active",
              PROMPT_STACK_CARD_HEADER_BUTTON_CLASS,
            )}
          >
            <Icon
              name={primaryDisplay.icon}
              className={activityIconClass("active", "size-3.5 shrink-0")}
              aria-hidden="true"
            />
            {useCompactSummary ? (
              <span className="min-w-0 flex-1 truncate text-left font-medium">
                {compactLabel}
              </span>
            ) : (
              <>
                <BackgroundActivitySummary
                  row={primary}
                  showDuration={false}
                  showFullCommand={isExpanded}
                />
                {hasMore ? (
                  <span className={activityMetaClass("active", "shrink-0")}>
                    +{others.length} more
                  </span>
                ) : null}
              </>
            )}
            <PromptStackCardChevron
              isExpanded={isExpanded}
              className={activityIconClass("active")}
            />
          </button>
        ) : (
          <div
            className={activityRowClass(
              "active",
              "flex min-h-8 w-full min-w-0 cursor-default items-center gap-1.5 rounded-none px-3 py-1.5 text-xs text-foreground",
            )}
            aria-label={backgroundActivityAriaLabel(primary)}
          >
            <Icon
              name={primaryDisplay.icon}
              className={activityIconClass("active", "size-3.5 shrink-0")}
              aria-hidden="true"
            />
            <BackgroundActivitySummary row={primary} showDuration />
          </div>
        )}
        {useCompactSummary ? null : stopButtonFor(primary, STOP_BUTTON_CLASS)}
      </div>
      {canExpand ? (
        <AnimatedBody
          id={BODY_ID}
          labelledBy={TOGGLE_ID}
          isExpanded={isExpanded}
          collapsedBorder="none"
        >
          <div className="flex flex-col gap-0.5 py-1">
            {useCompactSummary ? null : (
              <div className="flex min-w-0 flex-col px-3">
                <BackgroundCommandOutputTail row={primary} />
              </div>
            )}
            {expandedRows.map((row) => {
              const display = backgroundActivityDisplay(row);
              const model = backgroundActivityModel(row);
              const showsFullCommand =
                !isBackgroundAgentTaskType(row.taskType) &&
                row.command !== null;
              return (
                <div key={row.id} className="flex min-w-0 flex-col px-3">
                <div
                  className={cn(
                    "flex min-w-0 gap-1.5 py-0.5 text-xs",
                    showsFullCommand || useCompactSummary
                      ? "items-start"
                      : "items-center",
                  )}
                >
                  <Icon
                    name={display.icon}
                    className="size-3.5 shrink-0 text-muted-foreground/60"
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-muted-foreground",
                      showsFullCommand ? "font-mono" : undefined,
                      showsFullCommand || useCompactSummary
                        ? "whitespace-pre-wrap [overflow-wrap:anywhere]"
                        : "truncate",
                    )}
                    title={backgroundActivityText(row)}
                  >
                    {backgroundActivityText(row)}
                  </span>
                  {model ? (
                    <span
                      className="shrink-0 whitespace-nowrap font-mono text-2xs text-subtle-foreground"
                      title={`Model: ${model}`}
                    >
                      {model}
                    </span>
                  ) : null}
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-subtle-foreground">
                    {isExpanded ? (
                      <LiveDurationText startedAt={row.startedAt} />
                    ) : null}
                  </span>
                  {stopButtonFor(row, ROW_STOP_BUTTON_CLASS)}
                </div>
                  <BackgroundCommandOutputTail row={row} />
                </div>
              );
            })}
          </div>
        </AnimatedBody>
      ) : null}
    </PromptStackCard>
  );
}
