import { describe, expect, it } from "vitest";
import { selectUsage } from "./usage-footer.js";

const selectMeters = (limits: unknown) => selectUsage(limits).meters;

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

describe("selectUsage credits", () => {
  const windows = [
    { label: "Current session", usedPercent: 35, resetsAt: null, kind: "five-hour" },
  ];
  const observedCredits = {
    currency: "USD",
    decimalPlaces: 2,
    usedMinor: 210498,
    limitMinor: 350000,
  };
  const creditsFor = (credits: unknown) =>
    selectUsage({ "claude-code": { status: "ok", windows, credits } }).credits;

  it("converts minor units to dollars with a compact row and an exact tooltip", () => {
    expect(creditsFor(observedCredits)).toEqual({
      used: "$2,105",
      limit: "$3,500",
      usedPercent: 60,
      detail: "Usage credits this month: $2,104.98 of $3,500.00 (60%)",
    });
    expect(creditsFor({ ...observedCredits, usedMinor: 1240, limitMinor: 5000 })).toEqual({
      used: "$12.40",
      limit: "$50",
      usedPercent: 25,
      detail: "Usage credits this month: $12.40 of $50.00 (25%)",
    });
  });

  it("shows only the amount spent when no monthly limit is reported", () => {
    expect(creditsFor({ ...observedCredits, usedMinor: 1240, limitMinor: null })).toEqual({
      used: "$12.40",
      limit: null,
      usedPercent: null,
      detail: "Usage credits this month: $12.40, no monthly limit",
    });
  });

  it("keeps zero spend visible and caps overspend at a full bar", () => {
    expect(creditsFor({ ...observedCredits, usedMinor: 0 })).toMatchObject({
      used: "$0",
      usedPercent: 0,
    });
    expect(creditsFor({ ...observedCredits, usedMinor: 400000 })).toMatchObject({
      usedPercent: 100,
    });
  });

  it("has no credits when the provider reports none or a malformed object", () => {
    expect(creditsFor(undefined)).toBeNull();
    expect(creditsFor({ ...observedCredits, usedMinor: -1 })).toBeNull();
    expect(
      selectUsage({ "claude-code": { status: "ok", windows, credits: { usedMinor: "x" } } })
        .meters,
    ).toEqual([{ label: "5h", usedPercent: 35 }]);
  });

  it("keeps the footer when a provider reports credits but no plan windows", () => {
    expect(
      selectUsage({ "claude-code": { status: "ok", windows: [], credits: observedCredits } }),
    ).toMatchObject({ meters: [], credits: { used: "$2,105" } });
  });
});
