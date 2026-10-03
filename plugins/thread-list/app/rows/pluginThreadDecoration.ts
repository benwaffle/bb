import { createContext, useContext } from "react";
import type { PluginThreadDecoration } from "../model/project-thread-groups.js";

const NO_DECORATIONS: ReadonlyMap<string, PluginThreadDecoration> = new Map();

export const PluginThreadDecorationsContext =
  createContext<ReadonlyMap<string, PluginThreadDecoration>>(NO_DECORATIONS);

export function usePluginThreadDecoration(
  threadId: string,
): PluginThreadDecoration | null {
  return useContext(PluginThreadDecorationsContext).get(threadId) ?? null;
}

export function pluginThreadDepthPrefix(depth: number): string {
  return depth <= 0 ? "" : `${"  ".repeat(depth - 1)}└ `;
}
