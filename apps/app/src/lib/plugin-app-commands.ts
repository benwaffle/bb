import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import {
  keyboardCommandIdSchema,
  pluginCommandId,
  type KeyboardCommandId,
} from "@bb/domain";
import type {
  ExperimentalAppCommandInfo,
  ExperimentalAppCommands,
} from "@get-bb/plugin-sdk/app";
import {
  useAppCommandHandler,
  useAppCommandRunner,
} from "@/components/commands/AppCommandProvider";
import { APP_COMMAND_GROUPS } from "@/lib/app-command-metadata";
import { usePluginSlots } from "@/lib/plugin-slots";

function focusedTarget(): EventTarget | null {
  return typeof document === "undefined" ? null : document.activeElement;
}

export function usePluginAppCommands(): ExperimentalAppCommands {
  const runner = useAppCommandRunner();
  const { commandPaletteActions } = usePluginSlots();
  return useMemo(() => {
    const titled: { id: KeyboardCommandId; title: string }[] = [
      ...APP_COMMAND_GROUPS.flatMap((group) =>
        group.commands.map((metadata) => ({
          id: metadata.command,
          title: metadata.label,
        })),
      ),
      ...commandPaletteActions.map((command) => ({
        id: pluginCommandId(command.pluginId, command.id),
        title: command.title,
      })),
    ];
    return {
      execute(commandId) {
        const parsed = keyboardCommandIdSchema.safeParse(commandId);
        if (!parsed.success) return false;
        return runner.execute(parsed.data, focusedTarget());
      },
      list(): ExperimentalAppCommandInfo[] {
        const target = focusedTarget();
        return titled.map(({ id, title }) => ({
          id,
          title,
          available: runner.isCommandAvailable(id, target),
        }));
      },
    };
  }, [commandPaletteActions, runner]);
}

export function usePluginLeaderKeyCommand(handler: () => boolean): void {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  }, [handler]);
  const run = useCallback(() => handlerRef.current(), []);
  useAppCommandHandler("keymap.leader", run);
}
