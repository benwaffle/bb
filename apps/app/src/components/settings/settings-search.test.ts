import { describe, expect, it } from "vitest";
import { searchSettingsNav } from "./settings-search";
import { SETTINGS_NAV_SECTIONS } from "./settings-sections";

const plugins = [
  { icon: null, id: "linear", label: "Linear" },
  { icon: null, id: "gh-pr", label: "GitHub pull requests" },
];

function sectionIds(query: string) {
  return searchSettingsNav(query, SETTINGS_NAV_SECTIONS, plugins).sections.map(
    (match) => match.section.id,
  );
}

describe("searchSettingsNav", () => {
  it("returns everything for a blank query", () => {
    const results = searchSettingsNav("   ", SETTINGS_NAV_SECTIONS, plugins);
    expect(results.sections).toHaveLength(SETTINGS_NAV_SECTIONS.length);
    expect(results.plugins).toEqual(plugins);
  });

  it("matches a section by its label", () => {
    expect(sectionIds("appear")).toEqual(["appearance"]);
  });

  it("matches a section by a setting inside it and reports the matched setting", () => {
    const results = searchSettingsNav("theme", SETTINGS_NAV_SECTIONS, plugins);
    expect(results.sections.map((match) => match.section.id)).toEqual([
      "appearance",
    ]);
    expect(results.sections[0]?.matchedKeywords).toEqual(["Theme"]);
  });

  it("requires every whitespace-separated term to match", () => {
    expect(sectionIds("branch prefix")).toEqual(["general"]);
    expect(sectionIds("branch theme")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(sectionIds("STREAMER")).toEqual(["general"]);
  });

  it("matches plugins by label or id", () => {
    const byLabel = searchSettingsNav("pull", SETTINGS_NAV_SECTIONS, plugins);
    expect(byLabel.plugins.map((entry) => entry.id)).toEqual(["gh-pr"]);
    const byId = searchSettingsNav("gh-pr", SETTINGS_NAV_SECTIONS, plugins);
    expect(byId.plugins.map((entry) => entry.id)).toEqual(["gh-pr"]);
  });

  it("returns nothing for a query that matches no section or plugin", () => {
    const results = searchSettingsNav(
      "zzzz-not-a-setting",
      SETTINGS_NAV_SECTIONS,
      plugins,
    );
    expect(results.sections).toEqual([]);
    expect(results.plugins).toEqual([]);
  });
});
