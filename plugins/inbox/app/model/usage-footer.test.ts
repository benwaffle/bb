import { describe, expect, it } from "vitest";
import { selectMeters } from "./usage-footer.js";

describe("selectMeters", () => {
  const claude = {
    status: "ok",
    planLabel: "Max",
    windows: [
      { label: "Current session", usedPercent: 35, resetsAt: null, kind: "five-hour" },
      { label: "Weekly limit", usedPercent: 83.4, resetsAt: null, kind: "weekly" },
      { label: "Fable", usedPercent: 49, resetsAt: null, kind: "weekly", model: "fable" },
    ],
  };

  it("takes the all-model five-hour and weekly windows, then each model's window", () => {
    expect(selectMeters({ "claude-code": claude })).toEqual([
      { label: "5h", usedPercent: 35 },
      { label: "7d", usedPercent: 83 },
      { label: "Fable 7d", usedPercent: 49 },
    ]);
  });

  it("lists model windows after the all-model ones and keeps at most four bars", () => {
    const windows = [
      { label: "Fable", usedPercent: 10, resetsAt: null, kind: "weekly", model: "fable" },
      { label: "Opus", usedPercent: 20, resetsAt: null, kind: "weekly", model: "opus" },
      { label: "Sonnet", usedPercent: 30, resetsAt: null, kind: "weekly", model: "sonnet" },
      { label: "Weekly limit", usedPercent: 40, resetsAt: null, kind: "weekly", model: null },
      { label: "Current session", usedPercent: 50, resetsAt: null, kind: "five-hour" },
      { label: "Second weekly", usedPercent: 60, resetsAt: null, kind: "weekly" },
    ];
    expect(selectMeters({ "claude-code": { status: "ok", windows } })).toEqual([
      { label: "5h", usedPercent: 50 },
      { label: "7d", usedPercent: 40 },
      { label: "Fable 7d", usedPercent: 10 },
      { label: "Opus 7d", usedPercent: 20 },
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
