import { describe, expect, it } from "vitest";
import { commandSuggestionSubmitsOnEnter } from "../src/prompt/mentions/command-trigger.js";

describe("commandSuggestionSubmitsOnEnter", () => {
  it("submits bb's clear and compact as soon as Enter picks them", () => {
    for (const name of ["clear", "compact"]) {
      expect(
        commandSuggestionSubmitsOnEnter({
          name,
          source: "command",
          origin: "builtin",
        }),
      ).toBe(true);
    }
  });

  it("leaves the composer open for a live agent command so arguments can follow the pill", () => {
    expect(
      commandSuggestionSubmitsOnEnter({
        name: "simplify",
        source: "command",
        origin: "builtin",
      }),
    ).toBe(false);
  });

  it("leaves the composer open for skills", () => {
    expect(
      commandSuggestionSubmitsOnEnter({
        name: "code-review",
        source: "skill",
        origin: "builtin",
      }),
    ).toBe(false);
  });

  it("leaves the composer open for project and user commands named like a built-in", () => {
    for (const origin of ["project", "user"] as const) {
      expect(
        commandSuggestionSubmitsOnEnter({
          name: "clear",
          source: "command",
          origin,
        }),
      ).toBe(false);
    }
  });
});
