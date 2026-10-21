// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { parseSidebarThreadDecoration } from "./plugin-sidebar-thread-decorations";

describe("parseSidebarThreadDecoration", () => {
  it("accepts a hue without a leading and drops hues outside 0–360", () => {
    expect(parseSidebarThreadDecoration({ title: "App", hue: 230 })).toEqual({
      leading: null,
      title: "App",
      hue: 230,
    });
    expect(parseSidebarThreadDecoration({ leading: " 🚀 ", hue: 361 })).toEqual(
      { leading: "🚀", title: null, hue: null },
    );
    expect(parseSidebarThreadDecoration({ title: "App", hue: -1 })).toBeNull();
    expect(
      parseSidebarThreadDecoration({ title: "App", hue: Number.NaN }),
    ).toBeNull();
    expect(
      parseSidebarThreadDecoration({ title: "App", hue: "230" }),
    ).toBeNull();
  });
});
