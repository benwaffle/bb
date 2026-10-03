import { createContext, useContext, useState, type ReactNode } from "react";
import {
  createHoverPopoverGroup,
  type HoverPopoverGroup,
} from "../../ui/hooks/use-hover-popover.js";

const TimelineHoverPreviewGroupContext =
  createContext<HoverPopoverGroup | null>(null);

export function TimelineHoverPreviewGroupProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [group] = useState(createHoverPopoverGroup);
  return (
    <TimelineHoverPreviewGroupContext.Provider value={group}>
      {children}
    </TimelineHoverPreviewGroupContext.Provider>
  );
}

export function useTimelineHoverPreviewGroup(): HoverPopoverGroup | null {
  return useContext(TimelineHoverPreviewGroupContext);
}
