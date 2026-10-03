import { useDeferredValue } from "react";
import {
  buildTimelineRowTitle,
  type TimelineWorkSummaryChild,
} from "@bb/thread-view";
import { ShellCommandHighlight } from "../../ui/shell-command-highlight.js";

interface TimelineSummaryHoverPreviewProps {
  rows: readonly TimelineWorkSummaryChild[];
}

interface CommandFirstLine {
  line: string;
  continues: boolean;
}

function commandFirstLine(command: string): CommandFirstLine {
  const lines = command.trim().split("\n");
  return { line: lines[0] ?? "", continues: lines.length > 1 };
}

interface SummaryChildPreviewProps {
  highlight: boolean;
  row: TimelineWorkSummaryChild;
}

function SummaryChildPreview({ highlight, row }: SummaryChildPreviewProps) {
  if (row.kind === "work" && row.workKind === "command") {
    const { line, continues } = commandFirstLine(row.command);
    return (
      <code className="block truncate font-mono text-xs text-foreground">
        {"$ "}
        {highlight ? (
          <ShellCommandHighlight command={line} flowingLines />
        ) : (
          line
        )}
        {continues ? " …" : null}
      </code>
    );
  }
  const title = buildTimelineRowTitle(row, {
    summaryStyle: "bundle",
    workStyle: "default",
  });
  return <span className="block truncate">{title.plain}</span>;
}

export function TimelineSummaryHoverPreview({
  rows,
}: TimelineSummaryHoverPreviewProps) {
  const highlight = useDeferredValue(true, false);
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <SummaryChildPreview highlight={highlight} row={row} />
        </li>
      ))}
    </ul>
  );
}
