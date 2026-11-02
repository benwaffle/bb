import { describe, expect, it } from "vitest";
import { formatWakeIn, snoozePresetTime } from "./inbox-state.js";

function at(year: number, month: number, day: number, hour = 0, minute = 0): number {
  return new Date(year, month - 1, day, hour, minute).getTime();
}

describe("snooze presets", () => {
  it("1h is an hour from now", () => {
    const now = at(2026, 11, 4, 23, 30);
    expect(snoozePresetTime("1h", now)).toBe(now + 60 * 60 * 1000);
  });

  it("tomorrow is 9am on the next calendar day, across a month end", () => {
    expect(snoozePresetTime("tomorrow", at(2026, 11, 30, 23, 59))).toBe(
      at(2026, 12, 1, 9),
    );
    expect(snoozePresetTime("tomorrow", at(2026, 11, 4, 1))).toBe(at(2026, 11, 5, 9));
  });

  it("next Monday is the coming Monday at 9am, a week out on a Monday", () => {
    expect(snoozePresetTime("monday", at(2026, 11, 4, 12))).toBe(at(2026, 11, 9, 9));
    expect(snoozePresetTime("monday", at(2026, 11, 8, 22))).toBe(at(2026, 11, 9, 9));
    expect(snoozePresetTime("monday", at(2026, 11, 9, 8))).toBe(at(2026, 11, 16, 9));
  });
});

describe("formatWakeIn", () => {
  it("rounds to minutes, hours and days", () => {
    expect(formatWakeIn(30_000, 0)).toBe("1m");
    expect(formatWakeIn(45 * 60_000, 0)).toBe("45m");
    expect(formatWakeIn(16 * 3_600_000, 0)).toBe("16h");
    expect(formatWakeIn(3 * 86_400_000, 0)).toBe("3d");
  });
});
