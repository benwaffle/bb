import type { TimelineTitle } from "@bb/thread-view";
import { cn } from "@bb/shared-ui/lib/utils";
import { ExpandableTimelineRow } from "./ExpandableTimelineRow.js";
import { TimelineReasoningDetail } from "./TimelineReasoningDetail.js";
import { TimelineStatusIndicator } from "./TimelineStatusIndicator.js";
import { TimelineTitleView } from "./TimelineTitleView.js";
import { ThinkingTokenCount } from "./ThinkingTokenCount.js";

const INDICATOR_HEADER_CLASS_NAME = "min-h-7 items-center";

interface TimelineWorkingIndicatorProps {
  label?: string;
  isThinking?: boolean;
  details?: string;
  reasoningId?: string;
  thinkingTextLength?: number;
}

export function TimelineWorkingIndicator({
  label,
  isThinking = false,
  details,
  reasoningId,
  thinkingTextLength = 0,
}: TimelineWorkingIndicatorProps) {
  const resolvedLabel = label ?? (isThinking ? "Thinking…" : "Working...");
  const hasDetails = (details?.trim().length ?? 0) > 0;

  if (isThinking || hasDetails) {
    const title: TimelineTitle = {
      segments: [
        { text: resolvedLabel, em: false, shimmer: true, truncate: true },
      ],
      decorations: [],
      tone: "default",
      action: null,
      plain: resolvedLabel,
    };
    return (
      <div className="mt-4">
        <ExpandableTimelineRow
          reasoningExpansionKey={reasoningId}
          expandable={hasDetails}
          headerClassName={INDICATOR_HEADER_CLASS_NAME}
          title={title}
          titleContent={
            <>
              <TimelineTitleView title={title} />
              <ThinkingTokenCount textLength={thinkingTextLength} />
            </>
          }
          renderBody={() => <TimelineReasoningDetail text={details ?? ""} />}
        />
      </div>
    );
  }

  return (
    <TimelineStatusIndicator
      label={<span className="animate-shine">{resolvedLabel}</span>}
      className={cn("mt-4 flex", INDICATOR_HEADER_CLASS_NAME)}
    />
  );
}
