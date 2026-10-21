import { createContext, useContext } from "react";
import {
  experimental_Icon as RegisteredIcon,
  type ExperimentalSidebarThreadGroupRowIcon,
  type ExperimentalSidebarThreadGroupRowTrailing,
  type ExperimentalSidebarThreadGroupTone,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";
import type { PluginThreadDecoration } from "../model/project-thread-groups.js";

const NO_DECORATIONS: ReadonlyMap<string, PluginThreadDecoration> = new Map();

export const PluginThreadDecorationsContext =
  createContext<ReadonlyMap<string, PluginThreadDecoration>>(NO_DECORATIONS);

export function usePluginThreadDecoration(
  threadId: string,
): PluginThreadDecoration | null {
  return useContext(PluginThreadDecorationsContext).get(threadId) ?? null;
}

export const TONE_TEXT_CLASS: Record<
  ExperimentalSidebarThreadGroupTone,
  string
> = {
  success: "text-success",
  muted: "text-muted-foreground",
  accent: "text-pr-merged",
  danger: "text-destructive",
};

const TONE_FILL_CLASS: Record<ExperimentalSidebarThreadGroupTone, string> = {
  success: "bg-success",
  muted: "bg-muted-foreground",
  accent: "bg-pr-merged",
  danger: "bg-destructive",
};

export const SidebarHeaderProjectContext = createContext<string | null>(null);

export function PluginRowIcon({
  icon,
}: {
  icon: ExperimentalSidebarThreadGroupRowIcon;
}) {
  return (
    <span
      data-sidebar-plugin-row-icon={icon.tone}
      className={cn(
        "flex size-3.5 shrink-0 items-center justify-center",
        TONE_TEXT_CLASS[icon.tone],
      )}
      aria-hidden="true"
    >
      <RegisteredIcon name={icon.name} fallback="Circle" className="size-3.5" />
    </span>
  );
}

export function PluginRowTrailing({
  trailing,
}: {
  trailing: ExperimentalSidebarThreadGroupRowTrailing;
}) {
  if (trailing.kind === "text") {
    return (
      <span
        data-sidebar-plugin-row-trailing="text"
        className="ml-auto shrink-0 truncate pl-2 text-subtle-foreground"
      >
        {trailing.text}
      </span>
    );
  }
  return (
    <span
      data-sidebar-plugin-row-trailing={`dot:${trailing.tone}`}
      className="ml-auto flex size-3.5 shrink-0 items-center justify-center"
      aria-hidden="true"
    >
      <span
        className={cn("size-1.5 rounded-full", TONE_FILL_CLASS[trailing.tone])}
      />
    </span>
  );
}

export function PluginThreadDepthRail({
  depth,
  lines = true,
}: {
  depth: number;
  lines?: boolean;
}) {
  if (depth <= 0) return null;
  return (
    <span
      data-sidebar-thread-depth={depth}
      className="flex shrink-0 self-stretch"
      aria-hidden="true"
    >
      {Array.from({ length: depth }, (_, level) => (
        <span key={level} className="relative w-3 self-stretch">
          {lines ? (
            <span className="absolute inset-y-0 left-1.5 w-px bg-sidebar-border" />
          ) : null}
        </span>
      ))}
    </span>
  );
}
