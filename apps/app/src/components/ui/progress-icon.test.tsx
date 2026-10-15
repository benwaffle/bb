// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "@bb/shared-ui/icon";

afterEach(cleanup);

describe("progress indicator icons", () => {
  it.each(["Spinner", "Loading"])(
    "draws %s as a rotating ring arc that slows instead of stopping under reduced motion",
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
      expect(svg.getAttribute("role")).toBeNull();
      expect(svg.getAttribute("data-progress-indicator")).toBe("active");
      expect(Array.from(svg.classList)).toEqual([
        "size-3.5",
        "text-muted-foreground",
        "animate-progress-ring",
        "motion-reduce:animate-progress-ring-slow",
      ]);
      const arcs = svg.querySelectorAll("path");
      expect(arcs).toHaveLength(1);
      expect(arcs[0]?.getAttribute("d")).toBe("M12 3a9 9 0 1 1-9 9");
      expect(arcs[0]?.getAttribute("fill")).toBe("none");
      expect(arcs[0]?.getAttribute("stroke")).toBe("currentColor");
      expect(arcs[0]?.getAttribute("stroke-linecap")).toBe("round");
    },
  );

  it("draws a spinner that is not spinning as the arc at rest in the caller's color", () => {
    const view = render(
      <Icon name="Spinner" className="size-4 text-success" aria-hidden />,
    );
    const svg = view.container.querySelector("svg[data-icon=Spinner]");
    expect(svg?.getAttribute("data-progress-indicator")).toBe("done");
    expect(Array.from(svg?.classList ?? [])).toEqual([
      "size-4",
      "text-success",
    ]);
    expect(svg?.querySelector("path")?.getAttribute("stroke")).toBe(
      "currentColor",
    );
  });
});
