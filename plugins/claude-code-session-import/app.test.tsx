// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";
import type { claudeSessionImportRpcContract } from "./src/rpc-contract.js";

const app = await loadPluginApp(() => import("./app"));

const PLUGIN_ID = "bb-plugin-claude-code-session-import";
const STORAGE_KEY = `${PLUGIN_ID}:session-browser-machine`;

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "scrollIntoView",
);

beforeEach(() => {
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  if (originalScrollIntoView === undefined) {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  } else {
    Object.defineProperty(
      Element.prototype,
      "scrollIntoView",
      originalScrollIntoView,
    );
  }
});

const laptop = { id: "host_laptop", name: "Laptop", connected: true };
const bigbox = { id: "host_bigbox", name: "bigbox", connected: true };
const studio = { id: "host_studio", name: "Studio", connected: false };

function sessionOn(hostId: string) {
  return {
    sessionId: `session-${hostId}`,
    sessionPath: `/home/dev/.claude/projects/app/session-${hostId}.jsonl`,
    cwd: "/home/dev/app",
    title: `Session on ${hostId}`,
    firstPrompt: null,
    lastActivityAt: 0,
    turnCount: 3,
    bbDriven: false,
    projectId: "project-app",
    projectName: "app",
    hiddenReason: null,
  };
}

function openBrowser(
  machines = [bigbox, laptop, studio],
  defaultHostId: string | null = laptop.id,
) {
  const slot = renderSlot<
    { projectId: string | null },
    typeof claudeSessionImportRpcContract
  >(
    app.homepageSections[0]!,
    { projectId: null },
    {
      pluginId: PLUGIN_ID,
      rpc: {
        listMachines: () => ({
          machines,
          primaryHostId: laptop.id,
          defaultHostId,
        }),
        listSessions: ({ hostId }) => {
          const machine = machines.find((candidate) => candidate.id === hostId);
          if (machine === undefined) throw new Error(`No machine "${hostId}"`);
          return {
            machine,
            projects: [],
            sessions: [sessionOn(machine.id)],
          };
        },
        importSession: ({ sessionId }) => ({
          threadId: `thread-${sessionId}`,
          title: null,
          turnCount: 3,
        }),
      },
    },
  );
  fireEvent.click(
    slot.getByRole("button", { name: "Import a Claude Code session" }),
  );
  return slot;
}

function rpcInputs(slot: ReturnType<typeof openBrowser>, method: string) {
  return slot.inspection.rpcCalls
    .filter((call) => call.method === method)
    .map((call) => call.input);
}

async function chooseMachine(name: string) {
  const trigger = screen.getByRole("combobox", { name: "Machine" });
  trigger.focus();
  fireEvent.keyDown(trigger, { key: "Enter" });
  const listbox = await screen.findByRole("listbox");
  const option = within(listbox)
    .getAllByRole("option")
    .find((candidate) => candidate.textContent === name);
  if (option === undefined) throw new Error(`no ${name} option`);
  fireEvent.keyDown(option, { key: "Enter" });
}

describe("home pill", () => {
  it("opens the session browser dialog", async () => {
    openBrowser();
    expect(
      await screen.findByRole("dialog", {
        name: "Import a Claude Code session",
      }),
    ).toBeDefined();
    await screen.findByText("Session on host_laptop");
  });
});

describe("session browser machine picker", () => {
  it("lists the primary host's sessions first and offers only connected machines", async () => {
    const slot = openBrowser();
    await screen.findByText("Session on host_laptop");
    expect(rpcInputs(slot, "listSessions")).toEqual([
      { hostId: laptop.id, dir: null },
    ]);
    const trigger = screen.getByRole("combobox", { name: "Machine" });
    expect(trigger.textContent).toBe("Laptop");
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Enter" });
    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["bigbox", "Laptop"]);
  });

  it("lists and imports from the chosen machine and remembers it", async () => {
    const slot = openBrowser();
    await screen.findByText("Session on host_laptop");
    await chooseMachine("bigbox");
    await screen.findByText("Session on host_bigbox");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(bigbox.id);

    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() => {
      expect(rpcInputs(slot, "importSession")).toEqual([
        {
          sessionId: "session-host_bigbox",
          hostId: bigbox.id,
          projectId: "project-app",
        },
      ]);
    });

    cleanup();
    const reopened = openBrowser();
    await screen.findByText("Session on host_bigbox");
    expect(rpcInputs(reopened, "listSessions")).toEqual([
      { hostId: bigbox.id, dir: null },
    ]);
  });

  it("falls back to the default when the remembered machine is not connected", async () => {
    window.localStorage.setItem(STORAGE_KEY, studio.id);
    const slot = openBrowser();
    await screen.findByText("Session on host_laptop");
    expect(rpcInputs(slot, "listSessions")).toEqual([
      { hostId: laptop.id, dir: null },
    ]);
  });

  it("asks for a machine instead of listing when no default exists", async () => {
    const slot = openBrowser([bigbox, laptop], null);
    await screen.findByText("Pick the machine that holds the session.");
    expect(rpcInputs(slot, "listSessions")).toEqual([]);
    await chooseMachine("Laptop");
    await screen.findByText("Session on host_laptop");
    expect(
      screen.queryByText("Pick the machine that holds the session."),
    ).toBeNull();
  });
});
