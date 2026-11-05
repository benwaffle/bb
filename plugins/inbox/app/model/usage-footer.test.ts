import { describe, expect, it } from "vitest";
import { selectMeters } from "./usage-footer.js";

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
