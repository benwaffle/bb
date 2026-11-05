import { describe, expect, it } from "vitest";
import { formatToday, formatTokens, formatUsd, selectMeters } from "./usage-footer.js";

describe("formatUsd", () => {
  it.each([
    [0, "$0.00"],
    [4.1, "$4.10"],
    [99.994, "$99.99"],
    [219.48, "$219"],
    [1_234.5, "$1,235"],
    [12_345, "$12.3k"],
  ])("%s → %s", (value, expected) => {
    expect(formatUsd(value)).toBe(expected);
  });
});

describe("formatTokens", () => {
  it.each([
    [0, "0"],
    [812, "812"],
    [999.6, "1k"],
    [1_000, "1k"],
    [45_300, "45k"],
    [999_950, "1M"],
    [1_240_000, "1.2M"],
    [217_240_516, "217M"],
    [3_400_000_000, "3.4B"],
  ])("%s → %s", (value, expected) => {
    expect(formatTokens(value)).toBe(expected);
  });
});

describe("formatToday", () => {
  it("joins cost and tokens on one line", () => {
    expect(formatToday({ costUsd: 4.1, tokens: 1_240_000 })).toBe(
      "Today $4.10 · 1.2M tokens",
    );
  });
});

describe("selectMeters", () => {
  const claude = {
    status: "ok",
    planLabel: "Max",
    windows: [
      { label: "Current session", usedPercent: 35, resetsAt: null, kind: "five-hour" },
      { label: "Weekly limit", usedPercent: 83.4, resetsAt: null, kind: "weekly" },
      { label: "Fable", usedPercent: 49, resetsAt: null, kind: "weekly" },
    ],
  };

  it("takes the five-hour and first weekly window", () => {
    expect(selectMeters({ "claude-code": claude })).toEqual([
      { label: "5h", usedPercent: 35 },
      { label: "7d", usedPercent: 83 },
    ]);
  });

  it("prefers Claude Code over providers listed before it", () => {
    const codex = {
      status: "ok",
      windows: [{ label: "5 hour", usedPercent: 10, resetsAt: null, kind: "five-hour" }],
    };
    expect(selectMeters({ codex, "claude-code": claude })[0]).toEqual({
      label: "5h",
      usedPercent: 35,
    });
  });

  it("falls back to another provider when Claude Code has no windows", () => {
    const opencode = {
      status: "ok",
      windows: [{ label: "Weekly", usedPercent: 120, resetsAt: null, kind: "weekly" }],
    };
    expect(
      selectMeters({
        "claude-code": { status: "unauthenticated", planLabel: null },
        opencode,
      }),
    ).toEqual([{ label: "7d", usedPercent: 100 }]);
  });

  it("returns no meters for windows without a kind or malformed limits", () => {
    expect(
      selectMeters({
        codex: { status: "ok", windows: [{ label: "plan", usedPercent: 5, resetsAt: null }] },
      }),
    ).toEqual([]);
    expect(selectMeters(null)).toEqual([]);
  });
});
