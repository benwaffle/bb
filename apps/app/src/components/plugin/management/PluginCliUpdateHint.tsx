import { UPDATE_ACTION_ICON } from "@bb/domain/update-state";
import { Icon } from "@bb/shared-ui/icon";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@bb/shared-ui/tooltip";
import { useSystemConfig } from "@/hooks/queries/system-queries";
import { isReadablePluginVersion, UPDATE_ICON_STYLE } from "./plugin-ui";

export function usePluginUpdatesFromUi(): boolean {
  return useSystemConfig().data?.generalSettings.pluginUpdatesFromUi ?? false;
}

function cliUpdateCommand(pluginId: string, range: string | null): string {
  return range === null
    ? `bb plugin update ${pluginId}`
    : `bb plugin update ${pluginId} --range '${range}'`;
}

export function PluginCliUpdateHint({
  pluginId,
  range,
}: {
  pluginId: string;
  range: string | null;
}) {
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      Updates are applied from the CLI after review:{" "}
      <code className="font-mono text-foreground">
        {cliUpdateCommand(pluginId, range)}
      </code>
    </p>
  );
}

export function PluginCliUpdateSignal({
  pluginId,
  version,
  range,
}: {
  pluginId: string;
  version: string;
  range: string | null;
}) {
  const available = isReadablePluginVersion(version)
    ? `Update to ${version} available.`
    : "Update available.";
  const description = `${available} Updates are applied from the CLI after review: ${cliUpdateCommand(pluginId, range)}`;
  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="img"
            tabIndex={0}
            aria-label={description}
            className="flex size-7 shrink-0 items-center justify-center rounded-full"
            style={UPDATE_ICON_STYLE}
          >
            <Icon name={UPDATE_ACTION_ICON} className="size-4" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent>{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
