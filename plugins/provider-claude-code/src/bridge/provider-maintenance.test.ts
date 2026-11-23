import { describe, expect, it } from "vitest";
import { __testing } from "./provider-maintenance.js";

function missingInstallationStatus() {
  return {
    executableName: "claude",
    executablePath: null,
    installed: false,
    installSource: "notInstalled" as const,
    currentVersion: null,
    latestVersion: "2.1.0",
    minimumSupportedVersion: null,
    npmPackageName: "@anthropic-ai/claude-code",
    npmGlobalPackageVersion: null,
    installAction: {
      kind: "install" as const,
      label: "Install" as const,
      command: "install Claude Code",
    },
    needsUpdate: false,
    versionUnsupported: false,
  };
}

describe("Claude Code provider maintenance", () => {
  it("normalizes aggregate and unique model-scoped usage windows", () => {
    const account = {
      email: "claude@example.com",
      subscriptionType: "Claude Max",
      apiProvider: "firstParty" as const,
    };
    expect(
      __testing.normalizeUsage(
        {
          five_hour: { utilization: 12.4, resets_at: "2026-01-02T03:04:05Z" },
          seven_day: { utilization: 55, resets_at: null },
          limits: [
            {
              kind: "weekly_scoped",
              scope: { model: { display_name: "Sonnet" } },
              percent: 30,
              resets_at: "2026-01-03T00:00:00Z",
            },
            {
              kind: "weekly_scoped",
              scope: { model: { display_name: "sonnet" } },
              percent: 80,
              resets_at: null,
            },
          ],
        },
        account,
      ),
    ).toMatchObject({
      status: "ok",
      accountEmail: "claude@example.com",
      planLabel: "Max",
      plan: { id: "max", multiplier: null },
      windows: [
        { label: "Current session", usedPercent: 12 },
        { label: "Weekly limit", usedPercent: 55 },
        { label: "Sonnet", usedPercent: 30 },
      ],
    });
  });

  describe("extra usage credits", () => {
    const account = {
      email: "claude@example.com",
      subscriptionType: "Claude Max",
      apiProvider: "firstParty" as const,
    };
    const observedExtraUsage = {
      is_enabled: true,
      monthly_limit: 350000,
      used_credits: 210498,
      utilization: 60.14228571428571,
      currency: "USD",
      decimal_places: 2,
      disabled_reason: null,
      user_disabled: false,
      spend_limit_reached: false,
    };
    const credits = (extraUsage: unknown) => {
      const usage = __testing.normalizeUsage(
        { five_hour: { utilization: 10, resets_at: null }, extra_usage: extraUsage },
        account,
      );
      if (usage.status !== "ok") throw new Error(`usage was ${usage.status}`);
      return usage.credits;
    };

    it("reports enabled credits and their monthly limit in minor units", () => {
      expect(credits(observedExtraUsage)).toEqual({
        currency: "USD",
        decimalPlaces: 2,
        usedMinor: 210498,
        limitMinor: 350000,
      });
    });

    it("reports a null limit when the account has no monthly limit", () => {
      expect(
        credits({ ...observedExtraUsage, monthly_limit: null, utilization: null }),
      ).toEqual({
        currency: "USD",
        decimalPlaces: 2,
        usedMinor: 210498,
        limitMinor: null,
      });
      expect(credits({ ...observedExtraUsage, monthly_limit: 0 })).toMatchObject({
        limitMinor: null,
      });
    });

    it("keeps zero spend as a real amount", () => {
      expect(
        credits({ ...observedExtraUsage, used_credits: 0, utilization: 0 }),
      ).toMatchObject({ usedMinor: 0, limitMinor: 350000 });
    });

    it("omits credits when extra usage is disabled, absent, or unmeasured", () => {
      expect(
        credits({ ...observedExtraUsage, is_enabled: false, user_disabled: true }),
      ).toBeUndefined();
      expect(credits(null)).toBeUndefined();
      expect(credits(undefined)).toBeUndefined();
      expect(credits({ ...observedExtraUsage, used_credits: null })).toBeUndefined();
    });

    it("falls back to USD cents when currency fields are missing or invalid", () => {
      expect(
        credits({
          is_enabled: true,
          monthly_limit: 5000,
          used_credits: 1240,
          utilization: 24.8,
          currency: "dollars",
        }),
      ).toEqual({
        currency: "USD",
        decimalPlaces: 2,
        usedMinor: 1240,
        limitMinor: 5000,
      });
    });

    it("keeps plan windows when the extra usage object is malformed", () => {
      const usage = __testing.normalizeUsage(
        {
          five_hour: { utilization: 10, resets_at: null },
          extra_usage: { is_enabled: "yes" },
        },
        account,
      );
      expect(usage).toMatchObject({
        status: "ok",
        windows: [{ label: "Current session", usedPercent: 10 }],
      });
      expect(usage).not.toHaveProperty("credits");
    });
  });

  it("keeps the native installer plan private behind the run method", () => {
    const run = __testing.buildProviderInstallationRun(
      missingInstallationStatus(),
      "install",
    );
    if (process.platform === "win32") {
      expect(run).toMatchObject({
        available: true,
        command: { command: "powershell.exe" },
        verification: { kind: "installed" },
      });
      expect(run.available && run.command.args.at(-1)).toContain(
        "https://claude.ai/install.ps1",
      );
      return;
    }
    expect(run).toMatchObject({
      available: true,
      command: { command: "sh" },
      verification: { kind: "installed" },
    });
    expect(run.available && run.command.args).toHaveLength(2);
    expect(run.available && run.command.args[1]).toContain(
      "https://claude.ai/install.sh",
    );
  });
});
