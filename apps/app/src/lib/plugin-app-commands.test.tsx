// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultAppSettings,
  type AppCommandContextKey,
  type AppDefaultKeybinding,
  type KeyboardCommandId,
} from "@bb/domain";
import type { ExperimentalAppCommands } from "@get-bb/plugin-sdk/app";
import {
  AppCommandProvider,
  useAppCommandHandler,
} from "@/components/commands/AppCommandProvider";
import {
  usePluginAppCommands,
  usePluginLeaderKeyCommand,
} from "./plugin-app-commands";

function defaultBinding(
  command: KeyboardCommandId,
  all: readonly AppCommandContextKey[] = ["mainSurface"],
): AppDefaultKeybinding {
  return {
    command,
    desktopOnly: false,
    shortcut: null,
    when: { all: [...all], none: [] },
  };
}

const testState = vi.hoisted(() => ({
  appCommandListeners: [] as ((command: string) => void)[],
}));

vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: {
      generalSettings: { ...defaultAppSettings, showKeyboardHints: false },
      keybindings: [],
      defaultKeybindings: [
        defaultBinding("thread.rename"),
        defaultBinding("pane.close", ["mainSurface", "splitActive"]),
        defaultBinding("thread.archive"),
        defaultBinding("keymap.leader"),
      ],
    },
  }),
}));

vi.mock("@/lib/plugin-slots", () => ({
  useBuiltinPluginIds: () => new Set<string>(),
  usePluginSlots: () => ({
    commandPaletteActions: [
      {
        target: "app",
        pluginId: "demo",
        id: "hello",
        title: "Demo: say hello",
        defaultShortcut: null,
        run: () => undefined,
      },
    ],
  }),
}));

vi.mock("@/lib/bb-desktop", () => ({
  getBbDesktopInfo: () => ({
    onAppCommand: (listener: (command: string) => void) => {
      testState.appCommandListeners.push(listener);
      return () => {
        testState.appCommandListeners = testState.appCommandListeners.filter(
          (candidate) => candidate !== listener,
        );
      };
    },
  }),
}));

function Handler({
  command,
  accept = true,
  onRun,
}: {
  command: KeyboardCommandId;
  accept?: boolean;
  onRun: (target: EventTarget | null) => void;
}) {
  useAppCommandHandler(command, ({ target }) => {
    onRun(target);
    return accept;
  });
  return null;
}

function renderCommands(children: ReactNode): () => ExperimentalAppCommands {
  let commands: ExperimentalAppCommands | null = null;
  function Probe() {
    commands = usePluginAppCommands();
    return null;
  }
  render(
    <AppCommandProvider>
      {children}
      <Probe />
    </AppCommandProvider>,
  );
  return () => {
    if (commands === null) throw new Error("Probe did not render");
    return commands;
  };
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  testState.appCommandListeners = [];
});

describe("usePluginAppCommands", () => {
  it("runs an available command for the focused element", () => {
    const runs: (EventTarget | null)[] = [];
    const commands = renderCommands(
      <Handler command="thread.rename" onRun={(target) => runs.push(target)} />,
    );
    const button = document.createElement("button");
    document.body.append(button);
    button.focus();

    expect(commands().execute("thread.rename")).toBe(true);
    expect(runs).toEqual([button]);
  });

  it.each([
    ["an unknown id", "thread.explode", true],
    ["a command whose context is inactive", "pane.close", true],
    ["a command whose handler declines", "thread.archive", false],
    ["a plugin command nobody handles", "plugin:demo/missing", true],
  ] as const)("returns false for %s", (_label, id, accept) => {
    const runs: string[] = [];
    const commands = renderCommands(
      <>
        <Handler command="pane.close" onRun={() => runs.push("pane.close")} />
        <Handler
          command="thread.archive"
          accept={accept}
          onRun={() => runs.push("thread.archive")}
        />
      </>,
    );

    expect(commands().execute(id)).toBe(false);
    expect(runs).toEqual(id === "thread.archive" ? ["thread.archive"] : []);
  });

  it("lists core and plugin commands with the palette's availability", () => {
    const commands = renderCommands(
      <>
        <Handler command="thread.rename" onRun={() => undefined} />
        <Handler command="pane.close" onRun={() => undefined} />
        <Handler command="plugin:demo/hello" onRun={() => undefined} />
      </>,
    );
    const byId = new Map(commands().list().map((info) => [info.id, info]));

    expect(byId.get("thread.rename")).toEqual({
      id: "thread.rename",
      title: "Rename thread",
      available: true,
    });
    expect(byId.get("pane.close")?.available).toBe(false);
    expect(byId.get("thread.archive")?.available).toBe(false);
    expect(byId.get("plugin:demo/hello")).toEqual({
      id: "plugin:demo/hello",
      title: "Demo: say hello",
      available: true,
    });
  });
});

describe("usePluginLeaderKeyCommand", () => {
  it("runs the handler when bb Desktop forwards the leader chord", () => {
    const handler = vi.fn(() => true);
    function Leader() {
      usePluginLeaderKeyCommand(handler);
      return null;
    }
    render(
      <AppCommandProvider>
        <Leader />
      </AppCommandProvider>,
    );

    for (const listener of testState.appCommandListeners) {
      listener("keymap.leader");
    }
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
