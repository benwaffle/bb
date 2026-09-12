import type { IconName } from "@bb/shared-ui/icon";
import { SETTINGS_ROUTE_PATH, getSettingsRoutePath } from "@/lib/route-paths";

export const SETTINGS_NAV_SECTIONS = [
  {
    icon: "Settings",
    id: "general",
    label: "General",
    keywords: [
      "Navigate to threads on creation",
      "Markdown formatting in prompt box",
      "Default thread followup behavior",
      "Steer active thread on Enter",
      "Open links in the in-app browser",
      "Rewrite localhost links",
      "Streamer mode",
      "New branch prefix",
      "bb CLI skills",
      "Voice input",
      "Microphone",
      "Debug",
      "Show diagnostic events",
    ],
  },
  {
    icon: "Bot",
    id: "providers",
    label: "Providers",
    keywords: ["Agents", "Models", "Claude Code", "Codex", "ACP", "Pi"],
  },
  {
    icon: "AiBrain01",
    id: "ai-services",
    label: "AI services",
    keywords: [
      "Thread titles",
      "Commit messages",
      "Voice input",
      "Transcription",
      "Automatic",
    ],
  },
  {
    icon: "Palette",
    id: "appearance",
    label: "Appearance",
    keywords: [
      "Theme",
      "Palette",
      "Dark mode",
      "Light mode",
      "Colors",
      "Sidebar thread list",
      "Sidebar navigation",
      "Sidebar footer",
      "Source code renderer",
      "Diffs renderer",
      "Favicon color",
      "Fade inactive splits",
    ],
  },
  {
    icon: "SlidersHorizontal",
    id: "keyboard",
    label: "Keyboard",
    keywords: [
      "Keyboard shortcuts",
      "Hotkeys",
      "Keybindings",
      "Show keyboard hints when holding CMD / Control",
    ],
  },
  {
    icon: "Browser",
    id: "browser",
    label: "Browser",
    keywords: ["Browsers", "Chrome", "Profiles", "Import browser profile"],
  },
  {
    icon: "File",
    id: "files",
    label: "Files",
    keywords: [
      "File preferences",
      "Local editor integration",
      "Open directories in",
      "Open files in",
      "File openers",
      "Editor",
    ],
  },
  {
    icon: "FolderGit",
    id: "projects",
    label: "Projects",
    keywords: ["Repositories", "Rename project", "Delete project"],
  },
  {
    icon: "Laptop",
    id: "machines",
    label: "Machines",
    keywords: [
      "Hosts",
      "Daemon",
      "Machine access",
      "Machine environment",
      "Environment variables",
      "GH_TOKEN",
    ],
  },
  {
    icon: "Lock",
    id: "environment-variables",
    label: "Environment variables",
    keywords: [
      "Machine environment",
      "Project environment",
      "Scope",
      "Global variables",
      "Overrides",
      "GH_TOKEN",
      "Secrets",
    ],
  },
  {
    icon: "PackageReceive",
    id: "updates",
    label: "Updates",
    keywords: ["Upgrade", "Version", "Provider CLIs", "Changelog"],
  },
  {
    icon: "Plug02",
    id: "plugins",
    label: "Installed plugins",
    keywords: ["Extensions", "New plugin"],
  },
  {
    icon: "Puzzle",
    id: "marketplaces",
    label: "Plugin marketplaces",
    keywords: ["Marketplace source", "Community plugins"],
  },
  {
    icon: "Beaker",
    id: "experiments",
    label: "Experiments",
    keywords: [
      "Beta",
      "Changelog preview",
      "Mobile app",
      "Sidebar progressive disclosure",
      "Timeline windowing",
    ],
  },
  {
    icon: "MessageSquare",
    id: "community",
    label: "Community",
    keywords: ["Discord", "GitHub"],
  },
  {
    icon: "Archive",
    id: "archived",
    label: "Archived threads",
    keywords: ["Restore thread", "Deleted threads"],
  },
] as const satisfies readonly {
  icon: IconName;
  id: string;
  keywords: readonly string[];
  label: string;
}[];

export type SettingsNavSection = (typeof SETTINGS_NAV_SECTIONS)[number];

export type SettingsSectionId = SettingsNavSection["id"];

export function isSettingsSectionId(value: string): value is SettingsSectionId {
  return SETTINGS_NAV_SECTIONS.some((section) => section.id === value);
}

export function getSettingsSectionRoutePath(
  sectionId: SettingsSectionId,
): string {
  return sectionId === "general"
    ? SETTINGS_ROUTE_PATH
    : getSettingsRoutePath(sectionId);
}
