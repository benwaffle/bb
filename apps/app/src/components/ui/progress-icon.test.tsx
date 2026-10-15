// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "@bb/shared-ui/icon";

afterEach(cleanup);

describe("progress indicator icons", () => {
  it.each(["Spinner", "Loading"])(
    "draws %s as a pulsing accent dot instead of a rotating glyph",
    (name) => {
      const view = render(
        <Icon
          name={name}
          className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
          aria-label="Working"
        />,
      );
      const svg = view.getByLabelText("Working");
      expect(svg.getAttribute("data-icon")).toBe(name);
      expect(svg.getAttribute("data-progress-indicator")).toBe("active");
      expect(Array.from(svg.classList)).toEqual([
        "size-3.5",
        "text-muted-foreground",
      ]);
      const dot = svg.querySelector("circle");
      expect(dot?.getAttribute("fill")).toBe("currentColor");
      expect(Array.from(dot?.classList ?? [])).toEqual([
        "text-progress",
        "animate-progress-pulse",
        "motion-reduce:animate-none",
      ]);
    },
  );

  it("draws a spinner that is not spinning as a static dot in the caller's color", () => {
    const view = render(
      <Icon name="Spinner" className="size-4 text-success" aria-hidden />,
    );
    const svg = view.container.querySelector("svg[data-icon=Spinner]");
    expect(svg?.getAttribute("data-progress-indicator")).toBe("done");
    expect(Array.from(svg?.classList ?? [])).toEqual([
      "size-4",
      "text-success",
    ]);
    expect(svg?.querySelector("circle")?.getAttribute("class")).toBeNull();
  });
});
