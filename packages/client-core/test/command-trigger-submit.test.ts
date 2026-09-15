import { describe, expect, it } from "vitest";
import { commandSuggestionSubmitsOnEnter } from "../src/prompt/mentions/command-trigger.js";

describe("commandSuggestionSubmitsOnEnter", () => {
  it("submits bb's own argument-less built-ins as soon as Enter picks them", () => {
    expect(
      commandSuggestionSubmitsOnEnter({
        source: "command",
        origin: "builtin",
        argumentHint: null,
      }),
    ).toBe(true);
  });

  it("leaves the composer open for an agent skill so arguments can follow the pill", () => {
    expect(
      commandSuggestionSubmitsOnEnter({
        source: "skill",
        origin: "builtin",
        argumentHint: "[low|medium|high]",
      }),
    ).toBe(false);
    expect(
      commandSuggestionSubmitsOnEnter({
        source: "skill",
        origin: "builtin",
        argumentHint: null,
      }),
    ).toBe(false);
  });

  it("leaves the composer open for a built-in that documents arguments", () => {
    expect(
      commandSuggestionSubmitsOnEnter({
        source: "command",
        origin: "builtin",
        argumentHint: "<instructions>",
      }),
    ).toBe(false);
  });

  it("leaves the composer open for project and user commands", () => {
    expect(
      commandSuggestionSubmitsOnEnter({
        source: "command",
        origin: "project",
        argumentHint: null,
      }),
    ).toBe(false);
  });
});
