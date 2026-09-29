// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import { makePluginUpdatesSystemConfig } from "@/test/fixtures/system-config";
import { systemConfigQueryKey } from "@/hooks/queries/query-keys";
import {
  EMPTY_PLUGIN_UPDATE_STATE,
  type PluginListItem,
  type PluginUpdateState,
} from "@/hooks/queries/plugin-settings-queries";
import { makePluginListItem } from "@/test/fixtures/plugins";
import { InstalledPluginRow } from "./InstalledPluginsTab";
import {
  PluginDetailReleaseControl,
  PluginDetailReleaseStatus,
} from "./PluginUpdatesCard";

const CLI_HINT =
  "Updates are applied from the CLI after review: bb plugin update linear";

function plugin(updateState: Partial<PluginUpdateState>): PluginListItem {
  return makePluginListItem({
    id: "linear",
    source: "npm:@example/linear@^1.6.0",
    rootDir: "/plugins/linear",
    version: "1.6.2",
    name: "Linear",
    sourceDisplay: "npm · @example/linear",
    updateState: { ...EMPTY_PLUGIN_UPDATE_STATE, ...updateState },
  });
}

function renderSurfaces(item: PluginListItem, pluginUpdatesFromUi: boolean) {
  const { queryClient, wrapper: QueryClientWrapper } =
    createQueryClientTestHarness();
  queryClient.setQueryData(
    systemConfigQueryKey(),
    makePluginUpdatesSystemConfig(pluginUpdatesFromUi),
  );
  const onUpdateClick = vi.fn();
  render(
    <MemoryRouter>
      <QueryClientWrapper>
        <InstalledPluginRow
          plugin={item}
          onUpdateClick={onUpdateClick}
          onOpenPlugin={vi.fn()}
        />
        <section aria-label="Release">
          <PluginDetailReleaseControl plugin={item} />
          <PluginDetailReleaseStatus plugin={item} />
        </section>
      </QueryClientWrapper>
    </MemoryRouter>,
  );
  return { onUpdateClick };
}

afterEach(() => {
  cleanup();
});

describe("plugin updates applied from the CLI", () => {
  it("replaces every update action with the CLI hint and keeps the available version visible", () => {
    renderSurfaces(plugin({ availableVersion: "1.9.0" }), false);

    expect(screen.queryByRole("button", { name: /update/i })).toBeNull();
    const release = within(screen.getByRole("region", { name: "Release" }));
    expect(release.getByText("1.9.0")).toBeTruthy();
    expect(release.getByText("Available")).toBeTruthy();
    expect(
      release.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === CLI_HINT,
      ),
    ).toBeTruthy();

    const signal = within(screen.getByTestId("plugin-update-signal-linear"));
    expect(
      signal.getByRole("img", {
        name: `Update to 1.9.0 available. ${CLI_HINT}`,
      }),
    ).toBeTruthy();
  });

  it("offers no Retry after a failed update and still points at the CLI", () => {
    renderSurfaces(
      plugin({
        availableVersion: "1.9.0",
        lastFailure: { version: "1.9.0", at: null, detail: "Load failed." },
      }),
      false,
    );

    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" && element.textContent === CLI_HINT,
      ),
    ).toBeTruthy();
  });

  it("keeps the update actions when pluginUpdatesFromUi is on", () => {
    const { onUpdateClick } = renderSurfaces(
      plugin({ availableVersion: "1.9.0" }),
      true,
    );

    screen.getByRole("button", { name: "Update to 1.9.0" }).click();
    expect(onUpdateClick).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Update Linear to 1.9.0" }),
    ).toBeTruthy();
    expect(screen.queryByText(CLI_HINT)).toBeNull();
  });
});
