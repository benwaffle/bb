// @vitest-environment jsdom

import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExperimentalAppCommands } from "@get-bb/plugin-sdk/app";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { OPEN_USAGE_COMMAND_ID } from "../model/usage-footer.js";

installTestPluginRuntime();
const { UsageFooter } = await import("./UsageFooter.js");

afterEach(cleanup);

const claudeLimits = {
  "claude-code": {
    status: "ok",
    planLabel: "Max",
    accountEmail: null,
    windows: [
      { label: "Current session", usedPercent: 42, resetsAt: null, kind: "five-hour" },
      { label: "Weekly limit", usedPercent: 81, resetsAt: null, kind: "weekly" },
    ],
  },
};

function renderFooter({
  limits,
  appCommands,
}: {
  limits: () => Promise<unknown>;
  appCommands?: ExperimentalAppCommands;
}) {
  const usageLimits = vi.fn(limits);
  const slot = renderSlot(
    { component: UsageFooter },
    {},
    {
      sdk: { system: { usageLimits: usageLimits as never } },
      ...(appCommands === undefined ? {} : { appCommands }),
    },
  );
  return { slot, usageLimits };
}

function commandsWithOpenUsage(
  execute: (id: string) => boolean,
  available: boolean,
): ExperimentalAppCommands {
  return {
    execute,
    list: () => [{ id: OPEN_USAGE_COMMAND_ID, title: "Open Usage", available }],
  };
}

function meterTexts(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll("[data-usage-meter]")].map(
    (meter) => meter.textContent,
  );
}

describe("UsageFooter", () => {
  it("shows only the 5h and 7d bars and opens Usage on click", async () => {
    const execute = vi.fn(() => true);
    const { slot } = renderFooter({
      limits: async () => claudeLimits,
      appCommands: commandsWithOpenUsage(execute, true),
    });

    const button = await slot.findByRole("button", { name: /5h.*42%.*7d.*81%/ });
    expect(meterTexts(slot.container)).toEqual(["5h42%", "7d81%"]);
    expect(slot.container.textContent).not.toMatch(/Today|tokens|\$/);

    fireEvent.click(button);
    expect(execute).toHaveBeenCalledWith(OPEN_USAGE_COMMAND_ID);
  });

  it("renders the bars without a button while the open-usage command is unavailable", async () => {
    const execute = vi.fn(() => true);
    const { slot } = renderFooter({
      limits: async () => claudeLimits,
      appCommands: commandsWithOpenUsage(execute, false),
    });

    await waitFor(() => expect(meterTexts(slot.container)).toHaveLength(2));
    expect(slot.queryByRole("button")).toBeNull();
    fireEvent.click(slot.getByText("42%"));
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    ["no provider reports windows", async () => ({
      codex: { status: "ok", planLabel: null, accountEmail: null, windows: [] },
    })],
    ["usage limits fail", async () => {
      throw new Error("usage limits unavailable");
    }],
  ])("renders nothing when %s", async (_case, limits) => {
    const { slot, usageLimits } = renderFooter({ limits });

    await waitFor(() => expect(usageLimits).toHaveBeenCalled());
    await act(async () => {});
    expect(slot.container.querySelector("[data-inbox-usage-footer]")).toBeNull();
  });
});
