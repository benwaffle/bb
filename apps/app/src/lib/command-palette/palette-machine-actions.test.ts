import { makeHost } from "@bb/test-helpers/domain-fixtures";
import { describe, expect, it, vi } from "vitest";
import { buildMachinePaletteActions } from "./palette-machine-actions";

describe("buildMachinePaletteActions", () => {
  it("offers one memory action per machine and navigates to that machine's page", () => {
    const navigate = vi.fn();
    const actions = buildMachinePaletteActions({
      hosts: [
        makeHost({ id: "host_1", name: "workstation" }),
        makeHost({ id: "host_2", name: "laptop" }),
      ],
      navigate,
    });

    expect(actions.map((action) => action.title)).toEqual([
      "Memory on workstation",
      "Memory on laptop",
    ]);
    expect(actions.map((action) => action.id)).toEqual([
      "machine-memory:host_1",
      "machine-memory:host_2",
    ]);
    expect(new Set(actions.map((action) => action.group))).toEqual(
      new Set(["Machines"]),
    );

    actions[1]!.run();
    expect(navigate).toHaveBeenCalledWith("/settings/machines/host_2/memory");
  });

  it("escapes machine ids that are not URL safe", () => {
    const navigate = vi.fn();
    const actions = buildMachinePaletteActions({
      hosts: [makeHost({ id: "host/one", name: "odd" })],
      navigate,
    });

    actions[0]!.run();
    expect(navigate).toHaveBeenCalledWith(
      "/settings/machines/host%2Fone/memory",
    );
  });

  it("offers nothing when no machines are paired", () => {
    expect(
      buildMachinePaletteActions({ hosts: [], navigate: vi.fn() }),
    ).toEqual([]);
  });
});
