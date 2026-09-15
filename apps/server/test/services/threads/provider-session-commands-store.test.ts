import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getRememberedProviderSessionCommands,
  providerSessionCommandsFilePath,
  rememberProviderSessionCommands,
} from "../../../src/services/threads/provider-session-commands-store.js";

const dataDirs: string[] = [];

function makeDataDir(): string {
  const dataDir = mkdtempSync(join(tmpdir(), "bb-session-commands-store-"));
  dataDirs.push(dataDir);
  return dataDir;
}

function record(hostId: string, providerId: string, names: string[]) {
  return {
    hostId,
    providerId,
    kind: "provider-claude-code/session-commands",
    state: {
      commands: names.map((name) => ({
        name,
        description: null,
        argumentHint: null,
        aliases: [],
      })),
    },
    updatedAt: 1,
  };
}

afterEach(() => {
  for (const dataDir of dataDirs.splice(0)) {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

describe("provider session commands store", () => {
  it("returns nothing before anything was remembered and creates the data dir on write", () => {
    const dataDir = join(makeDataDir(), "nested", "data");
    expect(
      getRememberedProviderSessionCommands(dataDir, {
        hostId: "host-a",
        providerId: "claude-code",
      }),
    ).toBeNull();

    rememberProviderSessionCommands(
      dataDir,
      record("host-a", "claude-code", ["code-review"]),
    );

    expect(
      getRememberedProviderSessionCommands(dataDir, {
        hostId: "host-a",
        providerId: "claude-code",
      })?.state.commands.map((command) => command.name),
    ).toEqual(["code-review"]);
    expect(readdirSync(dataDir)).toEqual(["provider-session-commands.json"]);
  });

  it("keeps machines and providers apart and lets the latest write win per key", () => {
    const dataDir = makeDataDir();
    rememberProviderSessionCommands(
      dataDir,
      record("host-a", "claude-code", ["stale"]),
    );
    rememberProviderSessionCommands(
      dataDir,
      record("host-b", "claude-code", ["elsewhere"]),
    );
    rememberProviderSessionCommands(
      dataDir,
      record("host-a", "codex", ["other-provider"]),
    );
    rememberProviderSessionCommands(
      dataDir,
      record("host-a", "claude-code", ["fresh"]),
    );

    const names = (hostId: string, providerId: string) =>
      getRememberedProviderSessionCommands(dataDir, {
        hostId,
        providerId,
      })?.state.commands.map((command) => command.name);
    expect(names("host-a", "claude-code")).toEqual(["fresh"]);
    expect(names("host-b", "claude-code")).toEqual(["elsewhere"]);
    expect(names("host-a", "codex")).toEqual(["other-provider"]);
    expect(names("host-b", "codex")).toBeUndefined();
  });

  it("treats a corrupt or foreign file as empty and recovers on the next write", () => {
    const dataDir = makeDataDir();
    writeFileSync(providerSessionCommandsFilePath(dataDir), "{ not json");
    expect(
      getRememberedProviderSessionCommands(dataDir, {
        hostId: "host-a",
        providerId: "claude-code",
      }),
    ).toBeNull();

    writeFileSync(
      providerSessionCommandsFilePath(dataDir),
      JSON.stringify({ version: 99, entries: [{ hostId: "host-a" }] }),
    );
    expect(
      getRememberedProviderSessionCommands(dataDir, {
        hostId: "host-a",
        providerId: "claude-code",
      }),
    ).toBeNull();

    rememberProviderSessionCommands(
      dataDir,
      record("host-a", "claude-code", ["code-review"]),
    );
    expect(
      getRememberedProviderSessionCommands(dataDir, {
        hostId: "host-a",
        providerId: "claude-code",
      })?.state.commands.map((command) => command.name),
    ).toEqual(["code-review"]);
  });
});
