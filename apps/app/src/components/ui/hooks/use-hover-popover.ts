import { useCallback, useEffect, useRef, useState } from "react";
import { useResponsiveOverlayBehavior } from "@bb/shared-ui/responsive-overlay";

interface HoverPopoverHandlers {
  onBlur: () => void;
  onFocus: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

export interface HoverPopoverGroup {
  isWarm: () => boolean;
  activate: (member: object, close: () => void) => void;
  deactivate: (member: object) => void;
}

interface UseHoverPopoverOptions {
  openDelayMs?: number;
  closeDelayMs?: number;
  hoverableContent?: boolean;
  openOnFocus?: boolean;
  group?: HoverPopoverGroup | null;
}

interface UseHoverPopoverResult {
  open: boolean;
  triggerHoverProps: HoverPopoverHandlers;
  contentHoverProps: HoverPopoverHandlers;
  handleOpenChange: (nextOpen: boolean) => void;
}

const DEFAULT_OPEN_DELAY_MS = 0;
const DEFAULT_CLOSE_DELAY_MS = 160;
const DEFAULT_GROUP_WARM_MS = 300;
const noop = () => undefined;
const preventAutoFocus = (event: Event) => {
  event.preventDefault();
};

const EMPTY_HOVER_PROPS: HoverPopoverHandlers = {
  onBlur: noop,
  onFocus: noop,
  onPointerEnter: noop,
  onPointerLeave: noop,
};

const NON_HOVERABLE_CONTENT_PROPS: HoverPopoverHandlers = {
  onBlur: noop,
  onFocus: noop,
  onPointerEnter: noop,
  onPointerLeave: noop,
  onOpenAutoFocus: preventAutoFocus,
  onCloseAutoFocus: preventAutoFocus,
};

interface ActiveGroupMember {
  member: object;
  close: () => void;
}

export function createHoverPopoverGroup(
  warmMs: number = DEFAULT_GROUP_WARM_MS,
): HoverPopoverGroup {
  let active: ActiveGroupMember | null = null;
  let lastClosedAt = Number.NEGATIVE_INFINITY;
  return {
    isWarm: () => active !== null || Date.now() - lastClosedAt <= warmMs,
    activate: (member, close) => {
      const previous = active;
      active = { member, close };
      if (previous !== null && previous.member !== member) {
        previous.close();
      }
    },
    deactivate: (member) => {
      if (active?.member !== member) return;
      active = null;
      lastClosedAt = Date.now();
    },
  };
}

export function useHoverPopover({
  openDelayMs = DEFAULT_OPEN_DELAY_MS,
  closeDelayMs = DEFAULT_CLOSE_DELAY_MS,
  hoverableContent = true,
  openOnFocus = true,
  group = null,
}: UseHoverPopoverOptions = {}): UseHoverPopoverResult {
  const { supportsHover } = useResponsiveOverlayBehavior();
  const [open, setOpen] = useState(false);
  const [isFocusOverTrigger, setIsFocusOverTrigger] = useState(false);
  const [isFocusOverContent, setIsFocusOverContent] = useState(false);
  const [isPointerOverTrigger, setIsPointerOverTrigger] = useState(false);
  const [isPointerOverContent, setIsPointerOverContent] = useState(false);
  const toggleTimeoutRef = useRef<number | null>(null);
  const groupMemberRef = useRef<object>({});

  const clearToggleTimeout = useCallback(() => {
    if (toggleTimeoutRef.current === null) {
      return;
    }
    window.clearTimeout(toggleTimeoutRef.current);
    toggleTimeoutRef.current = null;
  }, []);

  useEffect(() => {
    clearToggleTimeout();
    if (!supportsHover) return;

    if (isFocusOverTrigger || isFocusOverContent) {
      if (!open) setOpen(true);
      return;
    }

    if (isPointerOverTrigger || isPointerOverContent) {
      if (open) return;

      if (openDelayMs <= 0 || group?.isWarm()) {
        setOpen(true);
        return;
      }

      toggleTimeoutRef.current = window.setTimeout(() => {
        setOpen(true);
        toggleTimeoutRef.current = null;
      }, openDelayMs);

      return clearToggleTimeout;
    }

    if (!open) return;

    toggleTimeoutRef.current = window.setTimeout(() => {
      setOpen(false);
      toggleTimeoutRef.current = null;
    }, closeDelayMs);

    return clearToggleTimeout;
  }, [
    clearToggleTimeout,
    closeDelayMs,
    isFocusOverContent,
    isFocusOverTrigger,
    group,
    supportsHover,
    isPointerOverContent,
    isPointerOverTrigger,
    open,
    openDelayMs,
  ]);

  useEffect(() => clearToggleTimeout, [clearToggleTimeout]);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        clearToggleTimeout();
        setOpen(true);
        return;
      }

      setIsPointerOverTrigger(false);
      setIsPointerOverContent(false);
      setIsFocusOverTrigger(false);
      setIsFocusOverContent(false);
      clearToggleTimeout();
      setOpen(false);
    },
    [clearToggleTimeout],
  );

  useEffect(() => {
    if (!open || group === null) return;
    const member = groupMemberRef.current;
    group.activate(member, () => handleOpenChange(false));
    return () => group.deactivate(member);
  }, [group, handleOpenChange, open]);

  const focusProps = (setFocused: (focused: boolean) => void) =>
    openOnFocus
      ? { onFocus: () => setFocused(true), onBlur: () => setFocused(false) }
      : { onFocus: noop, onBlur: noop };

  const triggerHoverProps = {
    ...(!supportsHover
      ? EMPTY_HOVER_PROPS
      : {
          onPointerEnter: () => {
            setIsPointerOverTrigger(true);
          },
          onPointerLeave: () => {
            setIsPointerOverTrigger(false);
          },
        }),
    ...focusProps(setIsFocusOverTrigger),
  };

  const contentHoverProps = {
    ...(!supportsHover
      ? EMPTY_HOVER_PROPS
      : hoverableContent
        ? {
            onPointerEnter: () => {
              setIsPointerOverContent(true);
            },
            onPointerLeave: () => {
              setIsPointerOverContent(false);
            },
            onOpenAutoFocus: preventAutoFocus,
            onCloseAutoFocus: preventAutoFocus,
          }
        : NON_HOVERABLE_CONTENT_PROPS),
    ...focusProps(setIsFocusOverContent),
  };

  return {
    open,
    triggerHoverProps,
    contentHoverProps,
    handleOpenChange,
  };
}
