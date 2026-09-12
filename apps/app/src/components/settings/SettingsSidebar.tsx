import { useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Input } from "@bb/shared-ui/input";
import { PluginIcon } from "@/components/plugin/PluginIcon";
import {
  SectionSidebar,
  SectionSidebarIcon,
  SectionSidebarLabel,
  SectionSidebarActionRow,
  SectionSidebarRow,
} from "@/components/sidebar/SectionSidebar";
import { SIDEBAR_STANDARD_ROW_PADDING_CLASS } from "@/components/sidebar/sidebarRowClasses";
import { canOpenNativeScreen, shellOpenNative } from "@/lib/native-shell";
import { getPluginConfigurationRoutePath } from "@/lib/route-paths";
import { cn } from "@bb/shared-ui/lib/utils";
import { useSettingsNavState } from "./settings-nav";
import type { SettingsNavState } from "./settings-nav";
import {
  normalizeSettingsSearchQuery,
  searchSettingsNav,
  type SettingsSectionSearchMatch,
} from "./settings-search";
import { getSettingsSectionRoutePath } from "./settings-sections";

const SEARCH_RESULT_HINT_LIMIT = 3;

interface SettingsSidebarProps {
  onResizeMouseDown: (event: ReactMouseEvent<HTMLDivElement>) => void;
  isResizing: boolean;
  appRoutePath: string;
  mobileHosted?: boolean;
}

type SettingsSidebarNavigation = Pick<
  SettingsNavState,
  "activePluginId" | "activeSection" | "pluginEntries" | "sections"
>;

interface SettingsSidebarContentProps extends SettingsSidebarProps {
  navigation: SettingsSidebarNavigation;
  testIdPrefix?: string;
}

function SearchResultHint({ match }: { match: SettingsSectionSearchMatch }) {
  if (match.matchedKeywords.length === 0) {
    return null;
  }
  const shown = match.matchedKeywords.slice(0, SEARCH_RESULT_HINT_LIMIT);
  const hidden = match.matchedKeywords.length - shown.length;
  const text =
    hidden > 0 ? `${shown.join(" · ")} +${hidden}` : shown.join(" · ");
  return (
    <div
      className={cn(
        SIDEBAR_STANDARD_ROW_PADDING_CLASS,
        "truncate pb-1 text-xs leading-4 text-subtle-foreground/60",
      )}
      data-testid="settings-search-hint"
    >
      {text}
    </div>
  );
}

export function SettingsSidebarContent({
  onResizeMouseDown,
  isResizing,
  appRoutePath,
  mobileHosted,
  navigation,
  testIdPrefix = "settings",
}: SettingsSidebarContentProps) {
  const { activePluginId, activeSection, pluginEntries, sections } = navigation;
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizeSettingsSearchQuery(query);
  const isSearching = normalizedQuery.length > 0;
  const results = useMemo(
    () => searchSettingsNav(normalizedQuery, sections, pluginEntries),
    [normalizedQuery, pluginEntries, sections],
  );
  const hasPlugins = pluginEntries.length > 0;
  const hasResults = results.sections.length > 0 || results.plugins.length > 0;

  return (
    <SectionSidebar
      backLabel="Back to app"
      backTo={appRoutePath}
      isResizing={isResizing}
      mobileHosted={mobileHosted}
      onResizeMouseDown={onResizeMouseDown}
      testIdPrefix={testIdPrefix}
    >
      <div className="pb-2">
        <Input
          aria-label="Search settings"
          className="h-8 text-sm"
          data-testid={`${testIdPrefix}-search-input`}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && query.length > 0) {
              event.preventDefault();
              setQuery("");
            }
          }}
          placeholder="Search settings"
          type="search"
          value={query}
        />
      </div>
      {isSearching ? (
        <>
          <SectionSidebarLabel>Results</SectionSidebarLabel>
          {hasResults ? (
            <div className="mt-1 space-y-0.5">
              {results.sections.map((match) => (
                <div key={match.section.id}>
                  <SectionSidebarRow
                    active={activeSection === match.section.id}
                    label={match.section.label}
                    to={getSettingsSectionRoutePath(match.section.id)}
                  >
                    <SectionSidebarIcon name={match.section.icon} />
                  </SectionSidebarRow>
                  <SearchResultHint match={match} />
                </div>
              ))}
              {results.plugins.map((entry) => (
                <SectionSidebarRow
                  key={entry.id}
                  active={activePluginId === entry.id}
                  label={entry.label}
                  to={getPluginConfigurationRoutePath({ pluginId: entry.id })}
                >
                  <PluginIcon
                    pluginId={entry.id}
                    icon={entry.icon}
                    className="size-4 shrink-0"
                  />
                </SectionSidebarRow>
              ))}
            </div>
          ) : (
            <p
              className={cn(
                SIDEBAR_STANDARD_ROW_PADDING_CLASS,
                "mt-1 text-xs leading-4 text-subtle-foreground/60",
              )}
              data-testid={`${testIdPrefix}-search-empty`}
            >
              No settings match “{query.trim()}”.
            </p>
          )}
        </>
      ) : (
        <>
          <SectionSidebarLabel>Settings</SectionSidebarLabel>
          <div className="mt-1 space-y-0.5">
            {sections
              .filter((section) => section.id !== "archived")
              .map((section) => (
                <SectionSidebarRow
                  key={section.id}
                  active={activeSection === section.id}
                  label={section.label}
                  to={getSettingsSectionRoutePath(section.id)}
                >
                  <SectionSidebarIcon name={section.icon} />
                </SectionSidebarRow>
              ))}
          </div>
          {hasPlugins ? (
            <>
              <div className="mt-4">
                <SectionSidebarLabel>Plugins</SectionSidebarLabel>
              </div>
              <div className="mt-1 space-y-0.5">
                {pluginEntries.map((entry) => (
                  <SectionSidebarRow
                    key={entry.id}
                    active={activePluginId === entry.id}
                    label={entry.label}
                    to={getPluginConfigurationRoutePath({
                      pluginId: entry.id,
                    })}
                  >
                    <PluginIcon
                      pluginId={entry.id}
                      icon={entry.icon}
                      className="size-4 shrink-0"
                    />
                  </SectionSidebarRow>
                ))}
              </div>
            </>
          ) : null}
          {canOpenNativeScreen() ? (
            <>
              <div className="mt-4">
                <SectionSidebarLabel>This phone</SectionSidebarLabel>
              </div>
              <div className="mt-1 space-y-0.5">
                <SectionSidebarActionRow
                  label="This device"
                  testId="settings-nav-native-device"
                  onClick={() => shellOpenNative("device-settings")}
                >
                  <SectionSidebarIcon name="Smartphone" />
                </SectionSidebarActionRow>
              </div>
            </>
          ) : null}
          {sections.some((section) => section.id === "archived") ? (
            <>
              <div className="mt-4">
                <SectionSidebarLabel>Archived</SectionSidebarLabel>
              </div>
              <div className="mt-1 space-y-0.5">
                {sections
                  .filter((section) => section.id === "archived")
                  .map((section) => (
                    <SectionSidebarRow
                      key={section.id}
                      active={activeSection === section.id}
                      label={section.label}
                      to={getSettingsSectionRoutePath(section.id)}
                    >
                      <SectionSidebarIcon name={section.icon} />
                    </SectionSidebarRow>
                  ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </SectionSidebar>
  );
}

export function SettingsSidebar({
  onResizeMouseDown,
  isResizing,
  appRoutePath,
  mobileHosted,
}: SettingsSidebarProps) {
  const navigation = useSettingsNavState();

  return (
    <SettingsSidebarContent
      appRoutePath={appRoutePath}
      isResizing={isResizing}
      mobileHosted={mobileHosted}
      navigation={navigation}
      onResizeMouseDown={onResizeMouseDown}
    />
  );
}
