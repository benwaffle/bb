import { useState } from "react";
import type { TimelineWorkflowWorkRow } from "@bb/server-contract";
import { ThreadBackgroundCommandsCard } from "./ThreadBackgroundCommandsCard";
import { backgroundCommandRow } from "@/test/fixtures/thread-timeline-rows";
import { StoryCard, StoryRow } from "../../../../.ladle/story-card";
import { FauxComposer, ResponsiveStage } from "./banner-story-stages";

export default {
  title: "promptbox/banner/Background Commands Card",
};

const runningCommand = (
  args: Parameters<typeof backgroundCommandRow>[0],
): TimelineWorkflowWorkRow =>
  backgroundCommandRow({
    status: "pending",
    taskStatus: "running",
    summary: null,
    ...args,
  });

const single: TimelineWorkflowWorkRow[] = [
  runningCommand({
    id: "thr_fixture:bg:tail-dev-log",
    description: "Poll all CI runs for batching head until completion",
    startedAt: Date.now() - 8_000,
  }),
];

const withOutput: TimelineWorkflowWorkRow[] = [
  runningCommand({
    id: "thr_fixture:bg:tick-a",
    command:
      "for i in $(seq 1 60); do echo \"$(date '+%H:%M:%S') A tick $i/60\"; sleep 10; done",
    description: "Count A ticks",
    familyId: "task-a",
    output:
      "16:30:08 A tick 1/60\n16:30:18 A tick 2/60\n16:30:28 A tick 3/60\n",
    startedAt: Date.now() - 37_000,
  }),
  runningCommand({
    id: "thr_fixture:bg:tick-b",
    command:
      "for i in $(seq 1 60); do echo \"$(date '+%H:%M:%S') B tick $i/60\"; sleep 10; done",
    description: "Count B ticks",
    familyId: "task-b",
    output:
      "16:30:01 B tick 1/60\n16:30:11 B tick 2/60\n16:30:21 B tick 3/60\n16:30:31 B tick 4/60\n",
    startedAt: Date.now() - 44_000,
  }),
];

const many: TimelineWorkflowWorkRow[] = [
  runningCommand({
    id: "thr_fixture:bg:dev-server",
    description: "Run the dev server",
    startedAt: Date.now() - 26_000,
  }),
  runningCommand({
    id: "thr_fixture:bg:watch-tests",
    description: "Watch and re-run tests",
    startedAt: Date.now() - 12_000,
  }),
  runningCommand({
    id: "thr_fixture:bg:tail-log",
    description: "Tail the dev server log",
    startedAt: Date.now() - 4_000,
  }),
];

const longScript = [
  ...withOutput,
  runningCommand({
    id: "thr_fixture:bg:long-script",
    command: Array.from(
      { length: 40 },
      (_, index) => `echo "migrating shard ${index + 1}" && sleep 2`,
    ).join("\n"),
    description: "Migrate every shard",
    familyId: "task-long",
    output: "migrating shard 1\nmigrating shard 2\n",
    startedAt: Date.now() - 12_000,
  }),
  ...many,
];

function ExpandableCard({
  commands,
  startExpanded = false,
}: {
  commands: TimelineWorkflowWorkRow[];
  startExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(startExpanded);
  return (
    <div className="flex flex-col gap-2">
      <ThreadBackgroundCommandsCard
        commands={commands}
        isExpanded={expanded}
        onToggle={() => setExpanded((value) => !value)}
        onStopCommand={() => {}}
      />
      <FauxComposer />
    </div>
  );
}

export function Overview() {
  return (
    <StoryCard>
      <StoryRow
        label="single"
        hint="header summarizes; expand for the command row, its time and stop"
      >
        <ResponsiveStage>
          <ExpandableCard commands={single} />
        </ResponsiveStage>
      </StoryRow>
      <StoryRow
        label="multiple (collapsed)"
        hint="summarized by count; click to expand the full list"
      >
        <ResponsiveStage>
          <ExpandableCard commands={many} />
        </ResponsiveStage>
      </StoryRow>
      <StoryRow
        label="multiple (expanded)"
        hint="expanded: every running command listed as a uniform row"
      >
        <ResponsiveStage>
          <ExpandableCard commands={many} startExpanded />
        </ResponsiveStage>
      </StoryRow>
      <StoryRow
        label="two commands with output (expanded)"
        hint="each row: command, elapsed time, stop, then its output tail"
      >
        <ResponsiveStage>
          <ExpandableCard commands={withOutput} startExpanded />
        </ResponsiveStage>
      </StoryRow>
      <StoryRow
        label="long script among many (expanded)"
        hint="command clamped to three lines with a per-row reveal; the body scrolls under a fixed header"
      >
        <ResponsiveStage>
          <ExpandableCard commands={longScript} startExpanded />
        </ResponsiveStage>
      </StoryRow>
    </StoryCard>
  );
}
