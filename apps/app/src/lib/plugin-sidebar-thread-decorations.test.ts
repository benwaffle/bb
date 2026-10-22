// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  parseSidebarThreadDecoration,
  parseSidebarThreadRowDecoration,
} from "./plugin-sidebar-thread-decorations";

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

describe("parseSidebarThreadRowDecoration", () => {
  it("keeps an HTTP(S) labelHref only alongside a label", () => {
    expect(
      parseSidebarThreadRowDecoration({
        label: "CORE-123",
        labelHref: "https://jira.example/browse/CORE-123",
      }),
    ).toMatchObject({
      label: "CORE-123",
      labelHref: "https://jira.example/browse/CORE-123",
    });
    expect(
      parseSidebarThreadRowDecoration({
        label: "CORE-123",
        labelHref: "javascript:alert(1)",
      }),
    ).toMatchObject({ label: "CORE-123", labelHref: null });
    expect(
      parseSidebarThreadRowDecoration({ label: "CORE-123", labelHref: "nope" }),
    ).toMatchObject({ labelHref: null });
    expect(
      parseSidebarThreadRowDecoration({
        labelHref: "https://jira.example/browse/CORE-123",
      }),
    ).toBeNull();
  });
});
