import { Fragment, useCallback, type ReactNode } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@bb/shared-ui/button";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { COARSE_POINTER_COMPACT_ICON_SIZE_CLASS } from "@bb/shared-ui/coarse-pointer-sizing";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bb/shared-ui/tooltip";
import { HEADER_PANE_ACTION_ICON_BUTTON_CLASS } from "@/components/layout/AppPageHeader";
import { PluginItemIcon } from "@/components/plugin/PluginIcon";
import {
  DEFAULT_DOCKED_PANEL_WIDTH_PERCENT,
  dockedPanelWidthKey,
  dockedPanelWidthPercentsAtom,
  dockedThreadPanelTab,
  getDockedThreadPanelsAtom,
  undockThreadPanel,
  type DockedThreadPanel,
} from "@/components/secondary-panel/dockedThreadPanels";
import {
  PANEL_RESIZE_HANDLE_LAYER_CLASS,
  PANEL_RESIZE_HIT_TARGET_CLASS,
} from "@/components/secondary-panel/panelTransitionTokens";
import type { PluginPanelFixedPanelTab } from "@/lib/fixed-panel-tabs-state";
import { CHROME_ROW_CLASS } from "@/lib/bb-desktop";
import { usePluginSlots } from "@/lib/plugin-slots";
import { useOptionalPaneContext } from "./PaneContext";

const DOCKED_PANEL_MIN_SIZE_PERCENT = 10;
const DOCKED_MAIN_MIN_SIZE_PERCENT = 25;
const DOCKED_PANEL_BUTTON_CLASS = cn(
  HEADER_PANE_ACTION_ICON_BUTTON_CLASS,
  CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
  "shrink-0",
);

export interface DockedThreadPanelColumnsProps {
  threadId: string;
  renderContent: (tab: PluginPanelFixedPanelTab) => ReactNode;
  onUndock: (panel: DockedThreadPanel) => void;
  className: string;
  children: ReactNode;
}

export function DockedThreadPanelColumns({
  threadId,
  renderContent,
  onUndock,
  className,
  children,
}: DockedThreadPanelColumnsProps) {
  const [panels, setPanels] = useAtom(getDockedThreadPanelsAtom(threadId));
  const widths = useAtomValue(dockedPanelWidthPercentsAtom);
  const setWidths = useSetAtom(dockedPanelWidthPercentsAtom);
  const isCompactViewport = useIsCompactViewport();
  const paneContext = useOptionalPaneContext();
  const { threadPanelActions } = usePluginSlots();
  const handleLayout = useCallback(
    (sizes: number[]) => {
      setWidths((current) => {
        let next = current;
        panels.forEach((panel, index) => {
          const size = sizes[index];
          const key = dockedPanelWidthKey(panel);
          if (size === undefined || size <= 0 || current[key] === size) return;
          next = { ...next, [key]: size };
        });
        return next;
      });
    },
    [panels, setWidths],
  );

  if (
    panels.length === 0 ||
    isCompactViewport ||
    (paneContext?.secondaryPanelHost ?? null) !== null
  ) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      <PanelGroup
        direction="horizontal"
        className="min-h-0 min-w-0 flex-1"
        data-testid="docked-thread-panels"
        onLayout={handleLayout}
      >
        {panels.map((panel, index) => {
          const tab = dockedThreadPanelTab(panel);
          const icon =
            threadPanelActions.find(
              (action) =>
                action.pluginId === panel.pluginId &&
                action.id === panel.actionId,
            )?.icon ?? null;
          return (
            <Fragment key={tab.id}>
              <Panel
                id={`docked-thread-panel-${tab.id}`}
                order={index}
                defaultSize={
                  widths[dockedPanelWidthKey(panel)] ??
                  DEFAULT_DOCKED_PANEL_WIDTH_PERCENT
                }
                minSize={DOCKED_PANEL_MIN_SIZE_PERCENT}
                className="flex min-w-0 flex-col overflow-clip bg-sidebar"
              >
                <section
                  aria-label={panel.title}
                  className="flex min-h-0 min-w-0 flex-1 flex-col"
                >
                  <div
                    className={cn(
                      CHROME_ROW_CLASS,
                      "min-w-0 shrink-0 gap-2 px-3",
                    )}
                  >
                    <PluginItemIcon
                      pluginId={panel.pluginId}
                      icon={icon}
                      className={COARSE_POINTER_COMPACT_ICON_SIZE_CLASS}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {panel.title}
                    </span>
                    <DockedPanelButton
                      label="Move to right panel"
                      icon="PanelRight"
                      onClick={() => {
                        setPanels((current) =>
                          undockThreadPanel(current, tab.id),
                        );
                        onUndock(panel);
                      }}
                    />
                    <DockedPanelButton
                      label="Close docked panel"
                      icon="X"
                      onClick={() =>
                        setPanels((current) =>
                          undockThreadPanel(current, tab.id),
                        )
                      }
                    />
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {renderContent(tab)}
                  </div>
                </section>
              </Panel>
              <PanelResizeHandle
                id={`docked-thread-panel-handle-${tab.id}`}
                hitAreaMargins={{ coarse: 0, fine: 0 }}
                tabIndex={-1}
                className={cn(
                  "relative w-px shrink-0 cursor-col-resize overflow-visible bg-border-seam hover:bg-ring/40 data-[resize-handle-state=drag]:bg-ring/40",
                  PANEL_RESIZE_HANDLE_LAYER_CLASS,
                )}
                aria-label={`Resize ${panel.title}`}
              >
                <span
                  aria-hidden
                  data-panel-resize-hit-target=""
                  className={PANEL_RESIZE_HIT_TARGET_CLASS}
                />
              </PanelResizeHandle>
            </Fragment>
          );
        })}
        <Panel
          id="docked-thread-panels-main"
          order={panels.length}
          minSize={DOCKED_MAIN_MIN_SIZE_PERCENT}
          className="flex min-w-0 flex-col overflow-clip"
        >
          {children}
        </Panel>
      </PanelGroup>
    </div>
  );
}

function DockedPanelButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: "PanelRight" | "X";
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={DOCKED_PANEL_BUTTON_CLASS}
          aria-label={label}
          onClick={onClick}
        >
          <Icon name={icon} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
