import {
  useCallback,
  type CSSProperties,
  type KeyboardEventHandler,
  type MouseEvent,
  type MouseEventHandler,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import type { ExperimentalResolvedSidebarProjectDecoration } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";
import { LIST_HOVER_TRANSITION } from "@/components/ui/motion";
import { CHROME_SECTION_LABEL_CLASS } from "@/components/ui/chrome-style-tokens";
import {
  SidebarStickyGroup,
  SidebarStickyTier,
} from "../ui/sidebar.js";
import {
  SIDEBAR_HOVER_ACTIONS_CLASS,
  SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
  SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
  SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE,
  SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
} from "@/components/ui/sidebar-hover-actions";
import type { ConsumeDragClickSuppression } from "@/components/ui/use-drag-click-suppression";
import {
  SIDEBAR_STANDARD_ROW_PADDING_CLASS,
  SIDEBAR_CONTROL_STATE_CLASS,
  SIDEBAR_GROUP_TEXT_CLASS,
} from "@/components/ui/sidebar-row-classes";
import {
  SectionDropTargetOverlay,
  useSectionDropTargetState,
} from "../dnd/useSectionDropTargetState.js";
import type { SidebarSortableDragBindings } from "@/components/ui/sortable-motion";
import {
  NO_COLLAPSED_CHILD_ACTIVITY,
  type CollapsedChildActivity,
} from "../model/thread-activity.js";
import { CollapsedThreadStatusGlyph } from "../rows/ThreadRow.js";
import {
  useThreadGroupSplitIndicator,
  type ThreadSplitIndicatorTarget,
} from "./groupRollups.js";
import { SplitPaneMiniMap } from "../rows/SplitPaneMiniMap.js";
import { COARSE_POINTER_ROW_ACTION_SIZE_CLASS } from "@/components/ui/coarse-pointer-sizing";
import { usePluginThreadRowStatusForThreads } from "./groupRollups.js";

const EMPTY_SPLIT_INDICATOR_THREADS: readonly ThreadSplitIndicatorTarget[] = [];

function stopActionsClick(event: MouseEvent<HTMLSpanElement>) {
  event.stopPropagation();
}

interface TopLevelSidebarSectionCollapseControl {
  isCollapsed: boolean;
  onToggleCollapsed: () => void;
}

export const SIDEBAR_PROJECT_TINT_ROW_CLASS = "bb-sidebar-project-tint-row";

interface SidebarSectionLabelProps {
  label: string;
  decoration: ExperimentalResolvedSidebarProjectDecoration | null;
  labelEditor: ReactNode | undefined;
  onRename: (() => void) | undefined;
}

export function SidebarSectionLabel({
  label,
  decoration,
  labelEditor,
  onRename,
}: SidebarSectionLabelProps) {
  const accentColor = decoration?.accentColor ?? null;
  return (
    <>
      {decoration?.leading ? (
        <span
          data-sidebar-section-leading=""
          className="relative z-20 inline-flex shrink-0 items-center"
        >
          {decoration.leading}
        </span>
      ) : null}
      {labelEditor ?? (
        <span
          data-sidebar-section-label=""
          className={cn(
            "min-w-0 truncate",
            accentColor !== null && "font-bold",
            decoration?.labelClassName,
          )}
          style={accentColor !== null ? { color: accentColor } : undefined}
          title={label}
          onDoubleClick={
            onRename
              ? (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRename();
                }
              : undefined
          }
        >
          {label}
        </span>
      )}
    </>
  );
}

type SidebarSectionTintStyle = CSSProperties & {
  "--bb-sidebar-project-tint": string;
};

function sidebarSectionTintStyle(
  decoration: ExperimentalResolvedSidebarProjectDecoration | null,
): SidebarSectionTintStyle | undefined {
  if (!decoration?.tint || decoration.accentColor === null) return undefined;
  return { "--bb-sidebar-project-tint": decoration.accentColor };
}

export interface TopLevelSidebarSectionProps {
  label: string;
  decoration?: ExperimentalResolvedSidebarProjectDecoration | null;
  labelEditor?: ReactNode;
  onRename?: () => void;
  children: ReactNode;
  dropParentKey?: string;
  sectionId?: string;
  stickyHeader?: boolean;
  status?: ReactNode;
  actions?: ReactNode;
  actionsAlwaysVisible?: boolean;
  actionsMobileAlways?: boolean;
  actionsOpen?: boolean;
  collapseControl?: TopLevelSidebarSectionCollapseControl;
  collapsedActivity?: CollapsedChildActivity;
  collapsedThreads?: readonly ThreadSplitIndicatorTarget[];
  dragBindings?: SidebarSortableDragBindings;
  sectionRef?: (element: HTMLDivElement | null) => void;
  sectionStyle?: CSSProperties;
  consumeClickSuppression?: ConsumeDragClickSuppression;
  isDropTargetActive?: boolean;
}

export function TopLevelSidebarSection({
  label,
  decoration = null,
  labelEditor,
  onRename,
  children,
  dropParentKey,
  sectionId,
  stickyHeader = true,
  status,
  actions,
  actionsAlwaysVisible = false,
  actionsMobileAlways = false,
  actionsOpen = false,
  collapseControl,
  collapsedActivity,
  collapsedThreads = EMPTY_SPLIT_INDICATOR_THREADS,
  dragBindings,
  sectionRef,
  sectionStyle,
  consumeClickSuppression,
  isDropTargetActive = false,
}: TopLevelSidebarSectionProps) {
  const threadDropState = useSectionDropTargetState(dropParentKey);
  const tintStyle = sidebarSectionTintStyle(decoration);
  const collapsedSplitIndicator = useThreadGroupSplitIndicator(
    collapsedThreads,
    collapseControl?.isCollapsed === true,
  );
  const pluginStatus = usePluginThreadRowStatusForThreads(collapsedThreads);
  const showCollapsedActivity =
    !status &&
    collapseControl?.isCollapsed === true &&
    (collapsedSplitIndicator.miniMap !== null ||
      collapsedActivity !== undefined ||
      pluginStatus !== null);
  const collapsedActivityIndicator = showCollapsedActivity ? (
    <span
      data-sidebar-collapsed-activity-edge=""
      data-sidebar-hover-actions-open={actionsOpen ? "true" : undefined}
      className={cn(
        "pointer-events-none absolute right-0 top-1/2 z-20 inline-flex -translate-y-1/2 items-center justify-center text-subtle-foreground max-md:static max-md:shrink-0 max-md:translate-y-0",
        COARSE_POINTER_ROW_ACTION_SIZE_CLASS,
        actions && SIDEBAR_HOVER_ACTIONS_FADE_CLASS,
      )}
    >
      {collapsedSplitIndicator.miniMap ? (
        <SplitPaneMiniMap
          slots={collapsedSplitIndicator.miniMap}
          label={`${label} — contains a thread open in split`}
          isWorking={
            collapsedActivity?.working || pluginStatus?.tone === "running"
          }
        />
      ) : collapsedActivity || pluginStatus ? (
        <CollapsedThreadStatusGlyph
          activity={collapsedActivity ?? NO_COLLAPSED_CHILD_ACTIVITY}
          pluginStatus={pluginStatus}
        />
      ) : null}
    </span>
  ) : null;
  const handleClickCapture = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (labelEditor || !consumeClickSuppression?.()) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    [consumeClickSuppression, labelEditor],
  );
  const handleCollapseControlClick = useCallback<
    MouseEventHandler<HTMLButtonElement>
  >(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      collapseControl?.onToggleCollapsed();
    },
    [collapseControl],
  );
  const stopCollapseControlPointerDown = useCallback<
    PointerEventHandler<HTMLButtonElement>
  >((event) => {
    event.stopPropagation();
  }, []);
  const stopCollapseControlKeyDown = useCallback<
    KeyboardEventHandler<HTMLButtonElement>
  >((event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.stopPropagation();
    }
  }, []);

  return (
    <SidebarStickyGroup
      ref={sectionRef}
      style={sectionStyle}
      data-sidebar-section-id={sectionId}
      data-sidebar-drop-target={threadDropState ?? undefined}
      data-sidebar-rename-row=""
      data-sidebar-sticky-header={stickyHeader ? undefined : "false"}
      className={cn(
        "group/sidebar-section relative min-w-0 rounded-md transition-colors",
        isDropTargetActive && "bg-sidebar-accent/60",
      )}
      onClickCapture={handleClickCapture}
    >
      {threadDropState ? (
        <SectionDropTargetOverlay state={threadDropState} />
      ) : null}
      <SidebarStickyTier
        ref={dragBindings?.setActivatorNodeRef}
        tier="label"
        style={tintStyle}
        data-sidebar-section-tint={tintStyle ? "" : undefined}
        className={cn(
          tintStyle && SIDEBAR_PROJECT_TINT_ROW_CLASS,
          SIDEBAR_HOVER_ACTIONS_ROW_CLASS,
          CHROME_SECTION_LABEL_CLASS,
          SIDEBAR_GROUP_TEXT_CLASS,
          SIDEBAR_STANDARD_ROW_PADDING_CLASS,
          "rounded-md pr-0 transition-colors",
          !stickyHeader && "relative top-auto",
          dragBindings && !dragBindings.disabled && "select-none",
        )}
        {...dragBindings?.attributes}
        {...(dragBindings?.listeners ?? {})}
      >
        <span className="relative z-10 flex min-w-0 flex-1 items-center gap-1 text-left">
          <SidebarSectionLabel
            label={label}
            decoration={decoration}
            labelEditor={labelEditor}
            onRename={onRename}
          />
          {collapseControl ? (
            <button
              type="button"
              disabled={Boolean(labelEditor)}
              data-sidebar-rename-anchor=""
              aria-expanded={!collapseControl.isCollapsed}
              data-sidebar-hover-actions-mobile={
                SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE
              }
              aria-label={
                collapseControl.isCollapsed
                  ? `Expand ${label} section`
                  : `Collapse ${label} section`
              }
              className={cn(
                !collapseControl.isCollapsed && SIDEBAR_HOVER_ACTIONS_CLASS,
                "relative z-20 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md outline-none ring-sidebar-ring focus-visible:ring-2",
                SIDEBAR_CONTROL_STATE_CLASS,
                LIST_HOVER_TRANSITION,
                labelEditor && "hidden",
              )}
              onClick={handleCollapseControlClick}
              onPointerDown={stopCollapseControlPointerDown}
              onKeyDown={stopCollapseControlKeyDown}
            >
              <Icon
                name="ChevronRight"
                className={cn(
                  "size-3 transition-transform duration-150",
                  !collapseControl.isCollapsed && "rotate-90",
                )}
                aria-hidden="true"
              />
            </button>
          ) : null}
        </span>
        {status || actions || collapsedActivityIndicator ? (
          <span
            data-sidebar-trailing-controls=""
            className={cn(
              "relative z-20 inline-flex h-7 shrink-0 items-center max-md:pointer-coarse:h-9",
              labelEditor && "hidden",
              SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
            )}
            onClick={status || actions ? stopActionsClick : undefined}
          >
            {status}
            {collapsedActivityIndicator}
            {actions ? (
              <span
                data-sidebar-hover-actions-open={
                  actionsOpen ? "true" : undefined
                }
                data-sidebar-hover-actions-mobile={
                  actionsMobileAlways
                    ? SIDEBAR_HOVER_ACTIONS_MOBILE_ALWAYS_VALUE
                    : undefined
                }
                className={cn(
                  "inline-flex shrink-0 items-center",
                  SIDEBAR_HOVER_ACTIONS_GAP_CLASS,
                  !actionsAlwaysVisible && SIDEBAR_HOVER_ACTIONS_CLASS,
                  collapseControl?.isCollapsed &&
                    "[@media(hover:none)]:hidden",
                )}
              >
                {actions}
              </span>
            ) : null}
          </span>
        ) : null}
      </SidebarStickyTier>
      {collapseControl?.isCollapsed || children == null ? null : (
        <div className="mt-1">{children}</div>
      )}
    </SidebarStickyGroup>
  );
}
