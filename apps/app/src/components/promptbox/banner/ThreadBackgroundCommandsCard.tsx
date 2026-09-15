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
import { ShellCommandHighlight } from "@/components/ui/shell-command-highlight";
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
  "flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-transparent text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground disabled:cursor-wait disabled:text-muted-foreground/60";
const COMMAND_CLAMP_LINES = 3;
const COMMAND_CLAMP_CHARACTERS = 200;
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

function backgroundActivityGroupIcon(
  rows: readonly TimelineWorkflowWorkRow[],
): BackgroundActivityDisplay["icon"] {
  return rows.some((row) => !isBackgroundAgentTaskType(row.taskType))
    ? "Terminal"
    : "UserRoundPlus";
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
      aria-label={`Background command output: ${backgroundActivityText(row)}`}
      className="ml-5 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border/60 bg-card px-2 py-1 font-mono text-2xs leading-tight text-muted-foreground"
    >
      {tail}
    </pre>
  );
}

function isLongBackgroundActivityText(text: string): boolean {
  return (
    text.split("\n").length > COMMAND_CLAMP_LINES ||
    text.length > COMMAND_CLAMP_CHARACTERS
  );
}

function BackgroundActivityRow({
  row,
  isExpanded,
  stopButton,
}: {
  row: TimelineWorkflowWorkRow;
  isExpanded: boolean;
  stopButton: ReactNode;
}) {
  const [showsFullText, setShowsFullText] = useState(false);
  const display = backgroundActivityDisplay(row);
  const model = backgroundActivityModel(row);
  const text = backgroundActivityText(row);
  const showsCommandLine =
    !isBackgroundAgentTaskType(row.taskType) && row.command !== null;
  const isLongText = isLongBackgroundActivityText(text);
  const textId = `${BODY_ID}-text-${row.id}`;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 items-start gap-1.5 text-xs">
        <Icon
          name={display.icon}
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/60"
          aria-hidden="true"
        />
        {showsCommandLine ? (
          <ShellCommandHighlight
            id={textId}
            command={text}
            title={text}
            flowingLines
            className={cn(
              "min-w-0 flex-1 whitespace-pre-wrap font-mono [overflow-wrap:anywhere]",
              isLongText && !showsFullText ? "line-clamp-3" : undefined,
            )}
          />
        ) : (
          <span
            id={textId}
            className={cn(
              "min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-muted-foreground",
              isLongText && !showsFullText ? "line-clamp-3" : undefined,
            )}
            title={text}
          >
            {text}
          </span>
        )}
        {model ? (
          <span
            className="shrink-0 whitespace-nowrap font-mono text-2xs text-subtle-foreground"
            title={`Model: ${model}`}
          >
            {model}
          </span>
        ) : null}
        <span className="shrink-0 whitespace-nowrap tabular-nums text-subtle-foreground">
          {isExpanded ? <LiveDurationText startedAt={row.startedAt} /> : null}
        </span>
        {stopButton}
      </div>
      {isLongText ? (
        <button
          type="button"
          aria-expanded={showsFullText}
          aria-controls={textId}
          onClick={() => setShowsFullText((value) => !value)}
          className="ml-5 self-start rounded-sm text-2xs font-medium text-subtle-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {showsFullText
            ? "Show less"
            : showsCommandLine
              ? "Show full command"
              : "Show full description"}
        </button>
      ) : null}
      <BackgroundCommandOutputTail row={row} />
    </div>
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
  isStopping,
  onStop,
}: {
  row: TimelineWorkflowWorkRow;
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
      className={STOP_BUTTON_CLASS}
    >
      <Icon
        name={isStopping ? "Loading" : "Square"}
        className={cn("size-3", isStopping && "animate-spin")}
        aria-hidden="true"
      />
    </button>
  );
}

function backgroundActivityCountLabel(
  rows: readonly TimelineWorkflowWorkRow[],
): string {
  const agentCount = rows.filter((row) =>
    isBackgroundAgentTaskType(row.taskType),
  ).length;
  const commandCount = rows.length - agentCount;
  if (commandCount === 0) {
    return `${agentCount} background agent${agentCount === 1 ? "" : "s"} running`;
  }
  if (agentCount === 0) {
    return `${commandCount} background command${commandCount === 1 ? "" : "s"} running`;
  }
  return `${rows.length} background activities running`;
}

function BackgroundActivitySummary({
  row,
  showDuration,
}: {
  row: TimelineWorkflowWorkRow;
  showDuration: boolean;
}) {
  const display = backgroundActivityDisplay(row);
  const model = backgroundActivityModel(row);
  const text = backgroundActivityText(row);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-1 text-left">
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
          "min-w-0 truncate",
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
  const hasMore = commands.length > 1;
  const useCompactSummary = isCompactCard ?? isCompactViewport;
  const hasFullCommandToReveal = commands.some(
    (row) => !isBackgroundAgentTaskType(row.taskType) && row.command !== null,
  );
  const hasStopToReveal =
    onStopCommand !== undefined &&
    commands.some((row) => isStoppableBackgroundCommand(row));
  const canExpand =
    hasMore || useCompactSummary || hasFullCommandToReveal || hasStopToReveal;
  const showsHeaderDetail = !useCompactSummary && !hasMore;
  const countLabel = backgroundActivityCountLabel(commands);
  const headerIcon = showsHeaderDetail
    ? backgroundActivityDisplay(primary).icon
    : backgroundActivityGroupIcon(commands);
  const groupLabel = backgroundActivityGroupLabel(commands);
  const isStopping = (row: TimelineWorkflowWorkRow): boolean =>
    stoppingTaskId !== null && row.familyId === stoppingTaskId;
  const stopButtonFor = (row: TimelineWorkflowWorkRow): ReactNode =>
    onStopCommand && isStoppableBackgroundCommand(row) ? (
      <StopBackgroundCommandButton
        row={row}
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
              showsHeaderDetail
                ? backgroundActivityAriaLabel(primary, groupLabel)
                : countLabel
            }
            onClick={onToggle}
            className={activityRowClass(
              "active",
              PROMPT_STACK_CARD_HEADER_BUTTON_CLASS,
            )}
          >
            <Icon
              name={headerIcon}
              className={activityIconClass("active", "size-3.5 shrink-0")}
              aria-hidden="true"
            />
            {showsHeaderDetail ? (
              <BackgroundActivitySummary row={primary} showDuration={false} />
            ) : (
              <span className="min-w-0 flex-1 truncate text-left font-medium">
                {countLabel}
              </span>
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
              name={headerIcon}
              className={activityIconClass("active", "size-3.5 shrink-0")}
              aria-hidden="true"
            />
            <BackgroundActivitySummary row={primary} showDuration />
          </div>
        )}
      </div>
      {canExpand ? (
        <AnimatedBody
          id={BODY_ID}
          labelledBy={TOGGLE_ID}
          isExpanded={isExpanded}
          collapsedBorder="none"
        >
          <div
            data-testid="thread-background-commands-card-rows"
            className="flex max-h-80 flex-col gap-2 overflow-y-auto overscroll-contain px-3 py-2"
          >
            {commands.map((row) => (
              <BackgroundActivityRow
                key={row.id}
                row={row}
                isExpanded={isExpanded}
                stopButton={stopButtonFor(row)}
              />
            ))}
          </div>
        </AnimatedBody>
      ) : null}
    </PromptStackCard>
  );
}
