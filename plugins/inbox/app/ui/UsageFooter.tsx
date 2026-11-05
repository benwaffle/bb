import { useEffect, useState } from "react";
import { experimental_useAppCommands, useSdk } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import {
  HOT_PERCENT,
  OPEN_USAGE_COMMAND_ID,
  USAGE_REFRESH_MS,
  USAGE_STATS_PLUGIN_ID,
  formatToday,
  hasUsage,
  selectMeters,
  todayDashboardInput,
  todayDashboardSchema,
  type UsageFooterData,
  type UsageMeter,
} from "../model/usage-footer.js";

function useUsageFooterData(): UsageFooterData | null {
  const sdk = useSdk();
  const [data, setData] = useState<UsageFooterData | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const [dashboard, limits] = await Promise.allSettled([
        sdk.plugins.callRpc({
          pluginId: USAGE_STATS_PLUGIN_ID,
          method: "dashboard",
          input: todayDashboardInput,
          outputSchema: todayDashboardSchema,
          signal: controller.signal,
        }),
        sdk.system.usageLimits({ signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return;
      setData({
        today: dashboard.status === "fulfilled" ? dashboard.value.current : null,
        meters: limits.status === "fulfilled" ? selectMeters(limits.value) : [],
      });
    };
    void load();
    const timer = setInterval(() => void load(), USAGE_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [sdk]);
  return data;
}

function Meter({ meter }: { meter: UsageMeter }) {
  return (
    <div
      data-usage-meter={meter.label}
      className="flex items-center gap-1.5 text-2xs tabular-nums"
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

export function UsageFooterView({
  data,
  onOpen,
}: {
  data: UsageFooterData;
  onOpen: (() => void) | null;
}) {
  const content = (
    <>
      {data.today !== null ? (
        <span className="truncate text-xs">{formatToday(data.today)}</span>
      ) : null}
      {data.meters.map((meter) => (
        <Meter key={meter.label} meter={meter} />
      ))}
    </>
  );
  const className =
    "flex w-full flex-col gap-1 px-2.5 py-2 text-left text-subtle-foreground";
  return (
    <div
      data-inbox-usage-footer=""
      className="sticky bottom-0 -mx-2 mt-2 border-t border-border-hairline bg-sidebar px-2"
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
  const data = useUsageFooterData();
  const commands = experimental_useAppCommands();
  if (data === null || !hasUsage(data)) return null;
  const canOpen = commands
    .list()
    .some((command) => command.id === OPEN_USAGE_COMMAND_ID && command.available);
  return (
    <UsageFooterView
      data={data}
      onOpen={canOpen ? () => void commands.execute(OPEN_USAGE_COMMAND_ID) : null}
    />
  );
}
