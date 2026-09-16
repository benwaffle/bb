import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import type { ThreadCost } from "@bb/server-contract";
import { cn } from "@bb/shared-ui/lib/utils";
import { useHoverPopover } from "../../ui/hooks/use-hover-popover.js";
import { formatCompactTokenCount } from "./thread-context-window-usage.js";
import { formatThreadCostUsd, threadCostDetailLabel } from "./thread-cost.js";

interface ThreadCostIndicatorProps {
  cost: ThreadCost;
  defaultOpen?: boolean;
}

interface ThreadCostCardProps {
  cost: ThreadCost;
  className?: string;
}

const THREAD_COST_POPOVER_CLOSE_DELAY_MS = 60;

function costReadout(cost: ThreadCost): string {
  return cost.totalUsd === null
    ? `${formatCompactTokenCount(cost.tokens.totalTokens)} tokens`
    : formatThreadCostUsd(cost.totalUsd);
}

export function ThreadCostCard({ cost, className }: ThreadCostCardProps) {
  const { tokens } = cost;
  const cacheReadTokens = Math.max(
    0,
    tokens.cachedInputTokens - tokens.cacheWriteInputTokens,
  );
  const rows: { label: string; value: string }[] = [
    { label: "Input", value: formatCompactTokenCount(tokens.inputTokens) },
    { label: "Output", value: formatCompactTokenCount(tokens.outputTokens) },
    { label: "Cache read", value: formatCompactTokenCount(cacheReadTokens) },
    {
      label: "Cache write",
      value: formatCompactTokenCount(tokens.cacheWriteInputTokens),
    },
  ];

  return (
    <div
      className={cn(
        "w-56 rounded-md border bg-popover p-2 text-popover-foreground shadow-md max-md:px-4",
        className,
      )}
    >
      <div className="flex flex-col gap-2 max-md:gap-3">
        <div className="flex items-baseline justify-between gap-2 text-xs max-md:text-sm">
          <span className="text-muted-foreground">
            {cost.totalUsd === null ? "Thread tokens" : "Thread cost"}
          </span>
          <span className="font-medium tabular-nums">{costReadout(cost)}</span>
        </div>
        <div className="flex flex-col gap-0.5 text-xs tabular-nums text-muted-foreground max-md:text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-2">
              <span>{row.label}</span>
              <span>{row.value}</span>
            </div>
          ))}
        </div>
        {cost.models.length > 0 ? (
          <div className="flex flex-col gap-0.5 border-t pt-1.5 text-xs tabular-nums text-muted-foreground max-md:text-sm">
            {cost.models.map((model) => (
              <div key={model.model} className="flex justify-between gap-2">
                <span className="truncate">{model.model}</span>
                <span className="shrink-0">
                  {model.costUsd === null
                    ? `${formatCompactTokenCount(model.tokens.totalTokens)} tokens`
                    : formatThreadCostUsd(model.costUsd)}
                </span>
              </div>
            ))}
          </div>
        ) : null}
        <span className="text-xs text-muted-foreground max-md:text-sm">
          {threadCostDetailLabel(cost)}
        </span>
      </div>
    </div>
  );
}

export function ThreadCostIndicator({
  cost,
  defaultOpen,
}: ThreadCostIndicatorProps) {
  const {
    open: hoverOpen,
    triggerHoverProps,
    contentHoverProps,
    handleOpenChange,
  } = useHoverPopover({ closeDelayMs: THREAD_COST_POPOVER_CLOSE_DELAY_MS });
  const open = defaultOpen || hoverOpen;
  const readout = costReadout(cost);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          {...triggerHoverProps}
          className="-mx-1 inline-flex h-8 cursor-pointer items-center justify-center rounded-full px-1 text-xs tabular-nums text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={
            cost.totalUsd === null
              ? `Thread usage ${readout}`
              : `Thread cost ${readout}`
          }
        >
          {readout}
          {cost.source === "reported" ? null : (
            <span aria-hidden="true" className="ml-0.5 opacity-60">
              ~
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        {...contentHoverProps}
        mobileTitle={cost.totalUsd === null ? "Thread tokens" : "Thread cost"}
        className="w-auto border-0 bg-transparent p-0 shadow-none max-md:p-0"
      >
        <ThreadCostCard
          cost={cost}
          className="max-md:w-full max-md:rounded-none max-md:border-0 max-md:bg-transparent max-md:px-4 max-md:pt-2 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:shadow-none"
        />
      </PopoverContent>
    </Popover>
  );
}
