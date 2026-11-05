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

interface RpcCall {
  pluginId: string;
  method: string;
  outputSchema: { parse(value: unknown): unknown };
}

const dashboard = {
  rangeDays: 1,
  current: { costUsd: 4.1, tokens: 1_240_000, turns: 12 },
  threads: [],
};

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
  rpc,
  limits,
  appCommands,
}: {
  rpc: (call: RpcCall) => Promise<unknown>;
  limits: () => Promise<unknown>;
  appCommands?: ExperimentalAppCommands;
}) {
  const callRpc = vi.fn(async (call: RpcCall) => call.outputSchema.parse(await rpc(call)));
  const usageLimits = vi.fn(limits);
  const slot = renderSlot(
    { component: UsageFooter },
    {},
    {
      sdk: {
        plugins: { callRpc: callRpc as never },
        system: { usageLimits: usageLimits as never },
      },
      ...(appCommands === undefined ? {} : { appCommands }),
    },
  );
  return { slot, callRpc, usageLimits };
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

describe("UsageFooter", () => {
  it("shows today's cost and tokens with 5h and 7d meters, and opens Usage on click", async () => {
    const execute = vi.fn(() => true);
    const { slot, callRpc } = renderFooter({
      rpc: async () => dashboard,
      limits: async () => claudeLimits,
      appCommands: commandsWithOpenUsage(execute, true),
    });

    const button = await slot.findByRole("button", { name: /Today \$4\.10 · 1\.2M tokens/ });
    expect(callRpc).toHaveBeenCalledWith(
      expect.objectContaining({ pluginId: "usage-stats", method: "dashboard" }),
    );
    const meters = [...slot.container.querySelectorAll("[data-usage-meter]")].map(
      (meter) => meter.textContent,
    );
    expect(meters).toEqual(["5h42%", "7d81%"]);

    fireEvent.click(button);
    expect(execute).toHaveBeenCalledWith(OPEN_USAGE_COMMAND_ID);
  });

  it("renders plain text without a button while the open-usage command is unavailable", async () => {
    const execute = vi.fn(() => true);
    const { slot } = renderFooter({
      rpc: async () => dashboard,
      limits: async () => claudeLimits,
      appCommands: commandsWithOpenUsage(execute, false),
    });

    await slot.findByText(/Today \$4\.10 · 1\.2M tokens/);
    expect(slot.queryByRole("button")).toBeNull();
    fireEvent.click(slot.getByText(/Today \$4\.10/));
    expect(execute).not.toHaveBeenCalled();
  });

  it("renders nothing when usage-stats is not installed and no provider reports windows", async () => {
    const { slot, callRpc, usageLimits } = renderFooter({
      rpc: async () => {
        throw new Error("plugin usage-stats is not running");
      },
      limits: async () => ({ codex: { status: "ok", planLabel: null, accountEmail: null, windows: [] } }),
    });

    await waitFor(() => {
      expect(callRpc).toHaveBeenCalled();
      expect(usageLimits).toHaveBeenCalled();
    });
    await act(async () => {});
    expect(slot.container.querySelector("[data-inbox-usage-footer]")).toBeNull();
  });

  it("keeps the meters but drops the cost line without usage-stats", async () => {
    const { slot } = renderFooter({
      rpc: async () => {
        throw new Error("plugin usage-stats is not running");
      },
      limits: async () => claudeLimits,
    });

    await waitFor(() =>
      expect(slot.container.querySelectorAll("[data-usage-meter]")).toHaveLength(2),
    );
    expect(slot.container.textContent).not.toContain("Today");
    expect(slot.queryByRole("button")).toBeNull();
  });
});
