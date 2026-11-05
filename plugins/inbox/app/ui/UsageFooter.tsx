import { useEffect, useState } from "react";
import { experimental_useAppCommands, useSdk } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import {
  HOT_PERCENT,
  OPEN_USAGE_COMMAND_ID,
  USAGE_REFRESH_MS,
  selectMeters,
  type UsageMeter,
} from "../model/usage-footer.js";

function useUsageMeters(): UsageMeter[] | null {
  const sdk = useSdk();
  const [meters, setMeters] = useState<UsageMeter[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const limits = await sdk.system
        .usageLimits({ signal: controller.signal })
        .then(selectMeters, () => []);
      if (controller.signal.aborted) return;
      setMeters(limits);
    };
    void load();
    const timer = setInterval(() => void load(), USAGE_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [sdk]);
  return meters;
}

function Meter({ meter }: { meter: UsageMeter }) {
  return (
    <div
      data-usage-meter={meter.label}
      className="flex items-center gap-1.5 text-2xs leading-none tabular-nums"
    >
      <span className="w-4 shrink-0">{meter.label}</span>
      <span className="h-1 flex-1 overflow-hidden rounded-sm bg-[color-mix(in_oklch,var(--ink)_12%,var(--canvas))]">
        <span
          className={cn(
            "block h-full rounded-sm",
            meter.usedPercent >= HOT_PERCENT ? "bg-attention" : "bg-muted-foreground",
          )}
          style={{ width: `${meter.usedPercent}%` }}
        />
      </span>
      <span className="w-7 shrink-0 text-right">{meter.usedPercent}%</span>
    </div>
  );
}

function UsageFooterView({
  meters,
  onOpen,
}: {
  meters: UsageMeter[];
  onOpen: (() => void) | null;
}) {
  const content = meters.map((meter) => <Meter key={meter.label} meter={meter} />);
  const className =
    "flex w-full flex-col gap-1 px-2.5 py-1 text-left text-subtle-foreground";
  return (
    <div
      data-inbox-usage-footer=""
      className="sticky bottom-0 -mx-2 mt-2 -mb-2 border-t border-border-hairline bg-sidebar px-2"
    >
      {onOpen === null ? (
        <div className={className}>{content}</div>
      ) : (
        <button
          type="button"
          title="Open Usage"
          onClick={onOpen}
          className={cn(className, "rounded-md hover:bg-state-hover hover:text-muted-foreground")}
        >
          {content}
        </button>
      )}
    </div>
  );
}

export function UsageFooter() {
  const meters = useUsageMeters();
  const commands = experimental_useAppCommands();
  if (meters === null || meters.length === 0) return null;
  const canOpen = commands
    .list()
    .some((command) => command.id === OPEN_USAGE_COMMAND_ID && command.available);
  return (
    <UsageFooterView
      meters={meters}
      onOpen={canOpen ? () => void commands.execute(OPEN_USAGE_COMMAND_ID) : null}
    />
  );
}
