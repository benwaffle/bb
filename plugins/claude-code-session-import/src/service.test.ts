import { describe, expect, it } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createClaudeSessionImportService } from "./service.js";

const laptop = { id: "host_laptop", name: "Laptop", status: "connected" };
const bigbox = { id: "host_bigbox", name: "bigbox", status: "connected" };
const studio = { id: "host_studio", name: "Studio", status: "disconnected" };

function setup(args: {
  hosts: ReadonlyArray<{ id: string; name: string; status: string }>;
  primaryHostId: string | null;
}) {
  const { bb, harness } = createFakePluginHost({
    sdk: {
      hosts: { list: async () => args.hosts },
      system: { config: async () => ({ primaryHostId: args.primaryHostId }) },
      projects: { list: async () => [] },
      environments: { list: async () => [] },
      threads: {
        list: async () => [],
        experimental_providerSessions: async () => ({ sessions: [] }),
      },
    },
    experimental_callHostRpc: () => ({ sessions: [] }),
  });
  return { service: createClaudeSessionImportService(bb), harness };
}

function listedHostIds(harness: ReturnType<typeof setup>["harness"]): string[] {
  return harness.inspection.experimental_hostRpcCalls.map(
    (call) => call.hostId,
  );
}

describe("machine selection", () => {
  it("lists sessions on the primary host when several machines are connected", async () => {
    const { service, harness } = setup({
      hosts: [bigbox, laptop],
      primaryHostId: laptop.id,
    });
    const listing = await service.listSessions({
      machine: null,
      dir: null,
      signal: undefined,
    });
    expect(listing.machine.id).toBe(laptop.id);
    expect(listedHostIds(harness)).toEqual([laptop.id]);
  });

  it("keeps an explicit machine over the primary host", async () => {
    const { service, harness } = setup({
      hosts: [bigbox, laptop],
      primaryHostId: laptop.id,
    });
    await service.listSessions({
      machine: "bigbox",
      dir: null,
      signal: undefined,
    });
    expect(listedHostIds(harness)).toEqual([bigbox.id]);
  });

  it("falls back to the only connected machine when the primary host is unknown", async () => {
    const { service } = setup({
      hosts: [laptop, studio],
      primaryHostId: null,
    });
    expect(await service.listMachineChoices(undefined)).toMatchObject({
      primaryHostId: null,
      defaultHostId: laptop.id,
    });
  });

  it("asks for --machine when the primary host is unknown and several are connected", async () => {
    const { service, harness } = setup({
      hosts: [bigbox, laptop],
      primaryHostId: null,
    });
    await expect(
      service.listSessions({ machine: null, dir: null, signal: undefined }),
    ).rejects.toThrow(
      /does not know which machine is local; pick the one holding the session with --machine:\n {2}host_bigbox {2}bigbox\n {2}host_laptop {2}Laptop/u,
    );
    expect(await service.listMachineChoices(undefined)).toMatchObject({
      defaultHostId: null,
    });
    expect(listedHostIds(harness)).toEqual([]);
  });

  it("names the primary host when it is disconnected and the choice is ambiguous", async () => {
    const { service } = setup({
      hosts: [bigbox, laptop, studio],
      primaryHostId: studio.id,
    });
    await expect(
      service.listSessions({ machine: null, dir: null, signal: undefined }),
    ).rejects.toThrow(/local machine Studio \(host_studio\) is not connected/u);
  });
});
