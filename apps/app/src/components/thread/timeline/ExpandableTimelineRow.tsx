import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import type { TimelineTitle } from "@bb/thread-view";
import { Popover, PopoverAnchor, PopoverContent } from "@bb/shared-ui/popover";
import {
  COLLAPSIBLE_HEADER_STATIC_TONE_CLASS,
  ExpandablePanel,
  getCollapsibleHeaderToneClass,
  type ExpandablePanelIntentHandlers,
} from "../../ui/disclosure.js";
import type { IconName } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { useHoverPopover } from "../../ui/hooks/use-hover-popover.js";
import { useTimelineHoverPreviewGroup } from "./TimelineHoverPreviewGroup.js";
import { useTimelineReasoningExpansion } from "./TimelineReasoningExpansion.js";
import {
  TIMELINE_HOVER_PREVIEW_COLLISION_PADDING_PX,
  TIMELINE_HOVER_PREVIEW_MIN_WIDTH_PX,
  TIMELINE_HOVER_PREVIEW_SIDE_OFFSET_PX,
  timelineHoverPreviewPlacement,
  type TimelineHoverPreviewPlacement,
} from "./timeline-hover-preview-placement.js";
import {
  TIMELINE_ROW_HEADER_CONTENT_CLASS_NAME,
  TimelineLeadingIcon,
  timelineRowHeaderClassName,
  timelineRowHorizontalPaddingClassName,
  type TimelineRowHorizontalPadding,
} from "./TimelineRowHeader.js";
import {
  TimelineTitleView,
  type TimelineTitleActionResolver,
} from "./TimelineTitleView.js";

interface ExpandableTimelineRowProps {
  reasoningExpansionKey?: string;
  autoExpanded?: boolean;
  forceExpanded?: boolean;
  terminalAutoExpanded?: boolean;
  renderBody: () => ReactNode;
  renderHoverPreview?: () => ReactNode;
  title: TimelineTitle;
  titleContent?: ReactNode;
  collapsedPreview?: ReactNode;
  expandable?: boolean;
  horizontalPadding?: TimelineRowHorizontalPadding;
  leadingIcon?: IconName;
  leadingIconFallback?: IconName;
  leadingIconUrl?: string;
  leadingIconStyle?: CSSProperties;
  headerClassName?: string;
  summaryClassName?: string;
  onTitleAction?: TimelineTitleActionResolver;
  onIntent?: () => void;
}

interface TimelineRowHoverPreviewProps {
  children: ReactNode;
  disabled: boolean;
  renderPreview: () => ReactNode;
}

const HOVER_PREVIEW_OPEN_DELAY_MS = 400;
const ROW_TITLE_SELECTOR = "[data-timeline-row-title]";

function measureHoverPreviewPlacement(
  row: HTMLElement,
  pointerX: number,
): TimelineHoverPreviewPlacement {
  const rowRect = row.getBoundingClientRect();
  const title = row.querySelector(ROW_TITLE_SELECTOR);
  return timelineHoverPreviewPlacement({
    pointerX,
    rowLeft: rowRect.left,
    titleRight: title?.getBoundingClientRect().right ?? pointerX,
    viewportWidth: window.innerWidth,
  });
}

function TimelineRowHoverPreview({
  children,
  disabled,
  renderPreview,
}: TimelineRowHoverPreviewProps) {
  const group = useTimelineHoverPreviewGroup();
  const { open, triggerHoverProps, contentHoverProps, handleOpenChange } =
    useHoverPopover({
      openDelayMs: HOVER_PREVIEW_OPEN_DELAY_MS,
      openOnFocus: false,
      group,
    });
  const rowRef = useRef<HTMLDivElement>(null);
  const pointerXRef = useRef(0);
  const [placement, setPlacement] =
    useState<TimelineHoverPreviewPlacement | null>(null);
  const anchorOffsetXRef = useRef(0);
  const virtualAnchorRef = useRef({
    getBoundingClientRect: (): DOMRect => {
      const rowRect = rowRef.current?.getBoundingClientRect();
      const x = (rowRect?.left ?? 0) + anchorOffsetXRef.current;
      return new DOMRect(x, rowRect?.top ?? 0, 0, rowRect?.height ?? 0);
    },
    get contextElement(): HTMLElement | undefined {
      return rowRef.current ?? undefined;
    },
  });
  const closePreview = useCallback((): void => {
    handleOpenChange(false);
  }, [handleOpenChange]);
  const trackPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    pointerXRef.current = event.clientX;
  }, []);
  const handlePointerEnter = useCallback(
    (event: PointerEvent<HTMLDivElement>): void => {
      pointerXRef.current = event.clientX;
      triggerHoverProps.onPointerEnter();
    },
    [triggerHoverProps],
  );
  const previewOpen = open && !disabled;

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!previewOpen || row === null) {
      setPlacement(null);
      return;
    }
    const next = measureHoverPreviewPlacement(row, pointerXRef.current);
    anchorOffsetXRef.current = next.anchorOffsetX;
    setPlacement(next);
  }, [previewOpen]);

  return (
    <Popover open={previewOpen} onOpenChange={handleOpenChange}>
      <PopoverAnchor virtualRef={virtualAnchorRef} />
      <div
        ref={rowRef}
        onPointerEnter={disabled ? undefined : handlePointerEnter}
        onPointerMove={disabled || open ? undefined : trackPointer}
        onPointerLeave={triggerHoverProps.onPointerLeave}
        onClickCapture={closePreview}
      >
        {children}
      </div>
      {previewOpen && placement !== null ? (
        <PopoverContent
          side={placement.side}
          align="start"
          sideOffset={TIMELINE_HOVER_PREVIEW_SIDE_OFFSET_PX}
          collisionPadding={TIMELINE_HOVER_PREVIEW_COLLISION_PADDING_PX}
          {...contentHoverProps}
          data-timeline-hover-preview=""
          style={{
            maxWidth: placement.maxWidth,
            minWidth: Math.min(
              TIMELINE_HOVER_PREVIEW_MIN_WIDTH_PX,
              placement.maxWidth,
            ),
          }}
          className="max-h-[min(28rem,var(--radix-popover-content-available-height))] w-max overflow-auto p-2 text-sm text-muted-foreground"
        >
          {renderPreview()}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

type CollapsedPreviewClickEvent = MouseEvent<HTMLDivElement>;
type CollapsedPreviewFocusEvent = FocusEvent<HTMLDivElement>;
type CollapsedPreviewKeyboardEvent = KeyboardEvent<HTMLDivElement>;

interface InteractivePreviewTargetArgs {
  currentTarget: HTMLDivElement;
  target: EventTarget | null;
}

function headerToneClass(title: TimelineTitle, isExpanded: boolean): string {
  if (title.tone === "summary") {
    return "text-subtle-foreground transition-colors hover:text-muted-foreground focus-visible:text-muted-foreground";
  }
  return getCollapsibleHeaderToneClass(isExpanded);
}

function isInteractivePreviewTarget({
  currentTarget,
  target,
}: InteractivePreviewTargetArgs): boolean {
  if (!(target instanceof Element) || target === currentTarget) {
    return false;
  }
  return target.closest("a,button,input,select,textarea") !== null;
}

const HOVER_INTENT_DELAY_MS = 80;

function useRowIntentHandlers(
  onIntent: (() => void) | undefined,
): ExpandablePanelIntentHandlers | undefined {
  const hoverTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (hoverTimerRef.current !== null) {
        window.clearTimeout(hoverTimerRef.current);
      }
    },
    [],
  );
  if (onIntent === undefined) {
    return undefined;
  }
  const cancelHover = (): void => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };
  return {
    onPointerEnter: (event) => {
      if (event.pointerType !== "mouse") {
        return;
      }
      cancelHover();
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null;
        onIntent();
      }, HOVER_INTENT_DELAY_MS);
    },
    onPointerLeave: cancelHover,
    onPointerDown: () => {
      cancelHover();
      onIntent();
    },
    onFocus: onIntent,
  };
}

function ExpandableTimelineRowComponent({
  autoExpanded = false,
  collapsedPreview,
  expandable = true,
  forceExpanded = false,
  headerClassName,
  horizontalPadding = "default",
  onIntent,
  leadingIcon,
  leadingIconFallback,
  leadingIconUrl,
  leadingIconStyle,
  onTitleAction,
  renderBody,
  renderHoverPreview,
  reasoningExpansionKey,
  summaryClassName,
  terminalAutoExpanded = false,
  title,
  titleContent,
}: ExpandableTimelineRowProps) {
  const [manualExpansionOverride, setManualExpansionOverride] =
    useTimelineReasoningExpansion(reasoningExpansionKey);
  const [terminalAutoExpandedLatch, setTerminalAutoExpandedLatch] =
    useState(terminalAutoExpanded);
  const [collapsedPreviewActive, setCollapsedPreviewActive] = useState(false);
  useEffect(() => {
    if (terminalAutoExpanded) {
      setTerminalAutoExpandedLatch(true);
    }
  }, [terminalAutoExpanded]);
  const isExpanded =
    expandable &&
    (forceExpanded ||
      (manualExpansionOverride ??
        (autoExpanded || terminalAutoExpanded || terminalAutoExpandedLatch)));
  useEffect(() => {
    if (isExpanded) {
      setCollapsedPreviewActive(false);
    }
  }, [isExpanded]);
  const intentHandlers = useRowIntentHandlers(onIntent);
  const horizontalPaddingClass =
    timelineRowHorizontalPaddingClassName(horizontalPadding);
  const handleToggle = useCallback((): void => {
    setManualExpansionOverride(!isExpanded);
  }, [isExpanded, setManualExpansionOverride]);
  const handleCollapsedPreviewClick = useCallback(
    (event: CollapsedPreviewClickEvent): void => {
      if (
        isInteractivePreviewTarget({
          currentTarget: event.currentTarget,
          target: event.target,
        })
      ) {
        return;
      }
      handleToggle();
    },
    [handleToggle],
  );
  const handleCollapsedPreviewKeyDown = useCallback(
    (event: CollapsedPreviewKeyboardEvent): void => {
      if (event.target !== event.currentTarget) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handleToggle();
    },
    [handleToggle],
  );
  const handleCollapsedPreviewBlur = useCallback(
    (event: CollapsedPreviewFocusEvent): void => {
      if (
        event.relatedTarget instanceof Node &&
        event.currentTarget.contains(event.relatedTarget)
      ) {
        return;
      }
      setCollapsedPreviewActive(false);
    },
    [],
  );

  const panel = (
    <ExpandablePanel
      intentHandlers={intentHandlers}
      isExpanded={isExpanded}
      onToggle={expandable ? handleToggle : undefined}
      headerToneClass={
        expandable
          ? headerToneClass(title, isExpanded)
          : COLLAPSIBLE_HEADER_STATIC_TONE_CLASS
      }
      collapsedContent={
        collapsedPreview ? (
          <div
            className={cn(
              horizontalPaddingClass,
              "pb-1 pt-0.5",
              expandable ? "cursor-pointer focus-visible:outline-none" : null,
            )}
            role={expandable ? "button" : undefined}
            tabIndex={expandable ? 0 : undefined}
            aria-expanded={expandable ? isExpanded : undefined}
            onClick={expandable ? handleCollapsedPreviewClick : undefined}
            onMouseEnter={
              expandable ? () => setCollapsedPreviewActive(true) : undefined
            }
            onMouseLeave={
              expandable ? () => setCollapsedPreviewActive(false) : undefined
            }
            onFocus={
              expandable ? () => setCollapsedPreviewActive(true) : undefined
            }
            onBlur={expandable ? handleCollapsedPreviewBlur : undefined}
            onKeyDown={expandable ? handleCollapsedPreviewKeyDown : undefined}
          >
            {collapsedPreview}
          </div>
        ) : null
      }
      summaryContent={
        <span
          data-timeline-row-title=""
          className={cn(
            "inline-flex min-w-0 max-w-full items-center gap-1.5",
            summaryClassName,
          )}
        >
          <TimelineLeadingIcon
            icon={leadingIcon}
            fallback={leadingIconFallback}
            iconUrl={leadingIconUrl}
            style={leadingIconStyle}
          />
          {titleContent ?? (
            <TimelineTitleView title={title} onTitleAction={onTitleAction} />
          )}
        </span>
      }
      summaryContentClassName={TIMELINE_ROW_HEADER_CONTENT_CLASS_NAME}
      forceHeaderChevronVisible={
        expandable && !isExpanded && collapsedPreviewActive
      }
      className="w-full"
      headerClassName={cn(
        timelineRowHeaderClassName(horizontalPadding),
        headerClassName,
      )}
      contentClassName={cn(horizontalPaddingClass, "pb-1 pt-0.5")}
      renderBody={renderBody}
    />
  );
  if (!expandable || !renderHoverPreview) {
    return panel;
  }
  return (
    <TimelineRowHoverPreview
      disabled={isExpanded}
      renderPreview={renderHoverPreview}
    >
      {panel}
    </TimelineRowHoverPreview>
  );
}

export const ExpandableTimelineRow = memo(ExpandableTimelineRowComponent);
