export type TimelineHoverPreviewSide = "left" | "right";

export interface TimelineHoverPreviewPlacement {
  side: TimelineHoverPreviewSide;
  anchorOffsetX: number;
  maxWidth: number;
}

interface TimelineHoverPreviewPlacementArgs {
  pointerX: number;
  rowLeft: number;
  titleRight: number;
  viewportWidth: number;
}

export const TIMELINE_HOVER_PREVIEW_SIDE_OFFSET_PX = 12;
export const TIMELINE_HOVER_PREVIEW_COLLISION_PADDING_PX = 8;
export const TIMELINE_HOVER_PREVIEW_MIN_WIDTH_PX = 256;
const TIMELINE_HOVER_PREVIEW_MAX_WIDTH_PX = 720;
const RESERVED_HORIZONTAL_SPACE_PX =
  TIMELINE_HOVER_PREVIEW_SIDE_OFFSET_PX +
  TIMELINE_HOVER_PREVIEW_COLLISION_PADDING_PX;

export function timelineHoverPreviewPlacement({
  pointerX,
  rowLeft,
  titleRight,
  viewportWidth,
}: TimelineHoverPreviewPlacementArgs): TimelineHoverPreviewPlacement {
  const rightAnchorX = Math.max(pointerX, titleRight);
  const rightRoom = viewportWidth - rightAnchorX - RESERVED_HORIZONTAL_SPACE_PX;
  const leftRoom = pointerX - RESERVED_HORIZONTAL_SPACE_PX;
  const side: TimelineHoverPreviewSide =
    rightRoom >= TIMELINE_HOVER_PREVIEW_MIN_WIDTH_PX || rightRoom >= leftRoom
      ? "right"
      : "left";
  const anchorX = side === "right" ? rightAnchorX : pointerX;
  const room = side === "right" ? rightRoom : leftRoom;
  return {
    side,
    anchorOffsetX: anchorX - rowLeft,
    maxWidth: Math.max(0, Math.min(TIMELINE_HOVER_PREVIEW_MAX_WIDTH_PX, room)),
  };
}
