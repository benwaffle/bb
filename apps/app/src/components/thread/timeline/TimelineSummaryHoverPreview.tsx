import {
  buildTimelineRowTitle,
  type TimelineWorkSummaryChild,
} from "@bb/thread-view";

interface TimelineSummaryHoverPreviewProps {
  rows: readonly TimelineWorkSummaryChild[];
}

function commandFirstLine(command: string): string {
  const lines = command.trim().split("\n");
  const first = lines[0] ?? "";
  return lines.length > 1 ? `${first} …` : first;
}

function SummaryChildPreview({ row }: { row: TimelineWorkSummaryChild }) {
  if (row.kind === "work" && row.workKind === "command") {
    return (
      <code className="block truncate font-mono text-xs text-foreground">
        $ {commandFirstLine(row.command)}
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
  return (
    <ul className="flex min-w-0 flex-col gap-1">
      {rows.map((row) => (
        <li key={row.id} className="min-w-0">
          <SummaryChildPreview row={row} />
        </li>
      ))}
    </ul>
  );
}
