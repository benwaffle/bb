// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SETTINGS_NAV_SECTIONS } from "./settings-sections";
import { SettingsSidebarContent } from "./SettingsSidebar";

const configurablePlugin = {
  icon: null,
  id: "linear",
  label: "Linear",
};

function renderSidebar(activePluginId: string | null = null) {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <SettingsSidebarContent
          appRoutePath="/"
          isResizing={false}
          mobileHosted
          navigation={{
            activePluginId,
            activeSection: activePluginId === null ? "general" : null,
            pluginEntries: [configurablePlugin],
            sections: SETTINGS_NAV_SECTIONS,
          }}
          onResizeMouseDown={() => {}}
        />
      </SidebarProvider>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe("SettingsSidebarContent plugin navigation", () => {
  it("offers installed-plugin management and configurable plugin settings", () => {
    renderSidebar();
    expect(
      screen
        .getByRole("link", { name: "Installed plugins" })
        .getAttribute("href"),
    ).toBe("/settings/plugins");
    expect(
      screen.getByRole("link", { name: "Linear" }).getAttribute("href"),
    ).toBe("/settings/plugins/linear");
    expect(
      screen.queryByRole("button", { name: /Other installed plugins/ }),
    ).toBeNull();
  });

  it("marks the active plugin settings page", () => {
    renderSidebar("linear");
    expect(
      screen.getByRole("link", { name: "Linear" }).getAttribute("aria-current"),
    ).toBe("page");
  });
});

describe("SettingsSidebarContent search", () => {
  it("filters sections and plugins to the query and shows matched settings", () => {
    renderSidebar();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search settings" }),
      {
        target: { value: "theme" },
      },
    );

    expect(
      screen.getByRole("link", { name: "Appearance" }).getAttribute("href"),
    ).toBe("/settings/appearance");
    expect(screen.queryByRole("link", { name: "General" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Linear" })).toBeNull();
    expect(screen.getByTestId("settings-search-hint").textContent).toBe(
      "Theme",
    );
  });

  it("shows an empty state and restores the full list when cleared with Escape", () => {
    renderSidebar();
    const input = screen.getByRole("searchbox", { name: "Search settings" });
    fireEvent.change(input, { target: { value: "no such setting" } });
    expect(screen.getByTestId("settings-search-empty").textContent).toContain(
      "no such setting",
    );
    expect(screen.queryByRole("link", { name: "Appearance" })).toBeNull();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("link", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Linear" })).toBeTruthy();
  });
});
