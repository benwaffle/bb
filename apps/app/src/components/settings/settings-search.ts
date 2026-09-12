import type { PluginSettingsEntry } from "./plugin-settings-entries";
import type { SettingsNavSection } from "./settings-sections";

export interface SettingsSectionSearchMatch {
  matchedKeywords: readonly string[];
  section: SettingsNavSection;
}

export interface SettingsSearchResults {
  plugins: readonly PluginSettingsEntry[];
  sections: readonly SettingsSectionSearchMatch[];
}

export function normalizeSettingsSearchQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokensOf(query: string): readonly string[] {
  return normalizeSettingsSearchQuery(query).split(" ").filter(Boolean);
}

function textMatchesEveryToken(text: string, tokens: readonly string[]) {
  const haystack = text.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

export function searchSettingsNav(
  query: string,
  sections: readonly SettingsNavSection[],
  pluginEntries: readonly PluginSettingsEntry[],
): SettingsSearchResults {
  const tokens = tokensOf(query);
  if (tokens.length === 0) {
    return {
      plugins: pluginEntries,
      sections: sections.map((section) => ({ matchedKeywords: [], section })),
    };
  }

  const sectionMatches: SettingsSectionSearchMatch[] = [];
  for (const section of sections) {
    const labelMatches = textMatchesEveryToken(section.label, tokens);
    const matchedKeywords = section.keywords.filter((keyword) =>
      textMatchesEveryToken(keyword, tokens),
    );
    if (labelMatches || matchedKeywords.length > 0) {
      sectionMatches.push({ matchedKeywords, section });
    }
  }

  return {
    plugins: pluginEntries.filter((entry) =>
      textMatchesEveryToken(`${entry.label} ${entry.id}`, tokens),
    ),
    sections: sectionMatches,
  };
}
