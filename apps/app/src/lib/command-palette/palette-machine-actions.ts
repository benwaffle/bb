import type { Host } from "@bb/domain";
import { getSettingsMachineMemoryRoutePath } from "@/lib/route-paths";
import type { PaletteAction } from "./palette-action";

interface BuildMachinePaletteActionsArgs {
  hosts: readonly Host[];
  navigate: (path: string) => void;
}

export function buildMachinePaletteActions(
  args: BuildMachinePaletteActionsArgs,
): PaletteAction[] {
  return args.hosts.map((host) => ({
    id: `machine-memory:${host.id}`,
    group: "Machines",
    title: `Memory on ${host.name}`,
    shortcut: null,
    run: () => args.navigate(getSettingsMachineMemoryRoutePath(host.id)),
  }));
}
