import { useEffect, useState, type RefCallback } from "react";
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
    <div data-usage-meter={meter.label} className="contents">
      <span className="truncate text-subtle-foreground">{meter.label}</span>
      <span className="h-1 overflow-hidden rounded-sm bg-[color-mix(in_oklch,var(--ink)_12%,var(--canvas))]">
        <span
          className={cn(
            "block h-full rounded-sm",
            meter.usedPercent >= HOT_PERCENT ? "bg-attention" : "bg-muted-foreground",
          )}
          style={{ width: `${meter.usedPercent}%` }}
        />
      </span>
      <span className="text-right text-muted-foreground">{meter.usedPercent}%</span>
    </div>
  );
}

const METERS_CLASS =
  "grid w-full grid-cols-[auto_minmax(0,1fr)_2.25rem] items-center gap-x-2 gap-y-1 px-4.5 py-1.5 text-left text-2xs leading-none tabular-nums";

function UsageFooterView({
  meters,
  onOpen,
  ref,
}: {
  meters: UsageMeter[];
  onOpen: (() => void) | null;
  ref?: RefCallback<HTMLDivElement>;
}) {
  const content = meters.map((meter) => <Meter key={meter.label} meter={meter} />);
  return (
    <div
      ref={ref}
      data-inbox-usage-footer=""
      className="sticky bottom-0 z-30 -mx-2 mt-2 -mb-2 border-t border-border-hairline bg-sidebar"
    >
      {onOpen === null ? (
        <div className={METERS_CLASS}>{content}</div>
      ) : (
        <button
          type="button"
          title="Open Usage"
          onClick={onOpen}
          className={cn(
            METERS_CLASS,
            "cursor-pointer outline-none hover:bg-state-hover focus-visible:bg-state-hover",
          )}
        >
          {content}
        </button>
      )}
    </div>
  );
}

export function UsageFooter({ ref }: { ref?: RefCallback<HTMLDivElement> }) {
  const meters = useUsageMeters();
  const commands = experimental_useAppCommands();
  if (meters === null || meters.length === 0) return null;
  const canOpen = commands
    .list()
    .some((command) => command.id === OPEN_USAGE_COMMAND_ID && command.available);
  return (
    <UsageFooterView
      ref={ref}
      meters={meters}
      onOpen={canOpen ? () => void commands.execute(OPEN_USAGE_COMMAND_ID) : null}
    />
  );
}
