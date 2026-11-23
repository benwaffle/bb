import { describe, expect, it } from "vitest";
import { providerUsageSchema } from "./provider-maintenance.js";

describe("provider usage credits", () => {
  const usage = {
    status: "ok",
    accountEmail: null,
    planLabel: "Max",
    windows: [{ label: "Current session", usedPercent: 12, resetsAt: null }],
  };
  const credits = {
    currency: "USD",
    decimalPlaces: 2,
    usedMinor: 210498,
    limitMinor: 350000,
  };

  it("accepts usage from bridges that report no credits", () => {
    const parsed = providerUsageSchema.parse(usage);
    expect(parsed).not.toHaveProperty("credits");
  });

  it("carries credits with or without a monthly limit", () => {
    expect(providerUsageSchema.parse({ ...usage, credits })).toMatchObject({ credits });
    expect(
      providerUsageSchema.parse({ ...usage, credits: { ...credits, limitMinor: null } }),
    ).toMatchObject({ credits: { limitMinor: null } });
  });

  it("rejects fractional or negative minor-unit amounts", () => {
    expect(
      providerUsageSchema.safeParse({ ...usage, credits: { ...credits, usedMinor: 12.4 } })
        .success,
    ).toBe(false);
    expect(
      providerUsageSchema.safeParse({ ...usage, credits: { ...credits, limitMinor: 0 } })
        .success,
    ).toBe(false);
  });
});
