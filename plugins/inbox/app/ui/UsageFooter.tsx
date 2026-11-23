import { useEffect, useState, type RefCallback } from "react";
import { experimental_useAppCommands, useSdk } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import {
  HOT_PERCENT,
  OPEN_USAGE_COMMAND_ID,
  USAGE_REFRESH_MS,
  selectUsage,
  type FooterUsage,
  type UsageCredits,
  type UsageMeter,
} from "../model/usage-footer.js";

const NO_USAGE: FooterUsage = { meters: [], credits: null };

function useFooterUsage(): FooterUsage | null {
  const sdk = useSdk();
  const [usage, setUsage] = useState<FooterUsage | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      const next = await sdk.system
        .usageLimits({ signal: controller.signal })
        .then(selectUsage, () => NO_USAGE);
      if (controller.signal.aborted) return;
      setUsage(next);
    };
    void load();
    const timer = setInterval(() => void load(), USAGE_REFRESH_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [sdk]);
  return usage;
}

function Bar({ usedPercent }: { usedPercent: number }) {
  return (
    <span className="h-1 overflow-hidden rounded-sm bg-[color-mix(in_oklch,var(--ink)_12%,var(--canvas))]">
      <span
        className={cn(
          "block h-full rounded-sm",
          usedPercent >= HOT_PERCENT ? "bg-attention" : "bg-muted-foreground",
        )}
        style={{ width: `${usedPercent}%` }}
      />
    </span>
  );
}

function Meter({ meter }: { meter: UsageMeter }) {
  return (
    <div data-usage-meter={meter.label} className="contents">
      <span className="truncate text-subtle-foreground">{meter.label}</span>
      <Bar usedPercent={meter.usedPercent} />
      <span className="text-right text-muted-foreground">{meter.usedPercent}%</span>
    </div>
  );
}

function CreditsMeter({ credits }: { credits: UsageCredits }) {
  return (
    <div data-usage-credits="" className="contents">
      <span className="truncate text-subtle-foreground">Credits</span>
      {credits.usedPercent === null || credits.limit === null ? (
        <span className="col-span-2 truncate text-right text-muted-foreground">
          {credits.used}
        </span>
      ) : (
        <>
          <Bar usedPercent={credits.usedPercent} />
          <span className="text-right text-muted-foreground">{credits.usedPercent}%</span>
          <span className="col-span-2 col-start-2 truncate text-muted-foreground">
            {credits.used} / {credits.limit}
          </span>
        </>
      )}
    </div>
  );
}

const METERS_CLASS =
  "grid w-full grid-cols-[auto_minmax(0,1fr)_2.25rem] items-center gap-x-2 gap-y-1 px-4.5 py-1.5 text-left text-2xs leading-none tabular-nums";

function UsageFooterView({
  usage,
  onOpen,
  ref,
}: {
  usage: FooterUsage;
  onOpen: (() => void) | null;
  ref?: RefCallback<HTMLDivElement>;
}) {
  const content = (
    <>
      {usage.meters.map((meter) => (
        <Meter key={meter.label} meter={meter} />
      ))}
      {usage.credits === null ? null : <CreditsMeter credits={usage.credits} />}
    </>
  );
  const title = [usage.credits?.detail, onOpen === null ? null : "Open Usage"]
    .filter((line) => line != null)
    .join("\n");
  return (
    <div
      ref={ref}
      data-inbox-usage-footer=""
      title={title === "" ? undefined : title}
      className="sticky bottom-0 z-30 -mx-2 mt-2 -mb-2 border-t border-border-hairline bg-sidebar"
    >
      {onOpen === null ? (
        <div className={METERS_CLASS}>{content}</div>
      ) : (
        <button
          type="button"
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
  const usage = useFooterUsage();
  const commands = experimental_useAppCommands();
  if (usage === null || (usage.meters.length === 0 && usage.credits === null)) return null;
  const canOpen = commands
    .list()
    .some((command) => command.id === OPEN_USAGE_COMMAND_ID && command.available);
  return (
    <UsageFooterView
      ref={ref}
      usage={usage}
      onOpen={canOpen ? () => void commands.execute(OPEN_USAGE_COMMAND_ID) : null}
    />
  );
}
