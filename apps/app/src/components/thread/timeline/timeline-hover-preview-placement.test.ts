import { describe, expect, it } from "vitest";
import { timelineHoverPreviewPlacement } from "./timeline-hover-preview-placement";

describe("timelineHoverPreviewPlacement", () => {
  it("anchors right of both the pointer and the row title", () => {
    expect(
      timelineHoverPreviewPlacement({
        pointerX: 150,
        rowLeft: 100,
        titleRight: 300,
        viewportWidth: 1_400,
      }),
    ).toEqual({ side: "right", anchorOffsetX: 200, maxWidth: 720 });
    expect(
      timelineHoverPreviewPlacement({
        pointerX: 500,
        rowLeft: 100,
        titleRight: 300,
        viewportWidth: 1_000,
      }),
    ).toEqual({ side: "right", anchorOffsetX: 400, maxWidth: 480 });
  });

  it("flips to the pointer's left when the right side is too narrow", () => {
    expect(
      timelineHoverPreviewPlacement({
        pointerX: 900,
        rowLeft: 100,
        titleRight: 300,
        viewportWidth: 1_000,
      }),
    ).toEqual({ side: "left", anchorOffsetX: 800, maxWidth: 720 });
  });

  it("stays right when neither side fits but the right has more room", () => {
    expect(
      timelineHoverPreviewPlacement({
        pointerX: 100,
        rowLeft: 0,
        titleRight: 100,
        viewportWidth: 300,
      }).side,
    ).toBe("right");
  });
});
