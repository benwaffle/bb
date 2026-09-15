// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultAppSettings, type AppKeybindings } from "@bb/domain";
import { AppCommandProvider } from "@/components/commands/AppCommandProvider";
import { resetAppRouteHistoryForTest } from "@/lib/app-route-history";
import { HistoryNavigationCommandHandler } from "./HistoryNavigationCommandHandler";

const HISTORY_KEYBINDINGS: AppKeybindings = [
  {
    command: "history.back",
    desktopOnly: false,
    shortcut: {
      key: "[",
      mod: true,
      meta: false,
      control: false,
      alt: false,
      shift: false,
    },
    when: {
      all: ["mainSurface"],
      none: ["modalOpen", "terminalFocus", "browserFocus"],
    },
  },
  {
    command: "history.forward",
    desktopOnly: false,
    shortcut: {
      key: "]",
      mod: true,
      meta: false,
      control: false,
      alt: false,
      shift: false,
    },
    when: {
      all: ["mainSurface"],
      none: ["modalOpen", "terminalFocus", "browserFocus"],
    },
  },
];

vi.mock("@/hooks/queries/system-queries", () => ({
  useSystemConfig: () => ({
    data: {
      generalSettings: defaultAppSettings,
      keybindings: HISTORY_KEYBINDINGS,
    },
  }),
}));

vi.mock("@/lib/bb-desktop", () => ({
  getBbDesktopInfo: () => null,
}));

function Harness() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <HistoryNavigationCommandHandler />
      <div data-testid="path">{location.pathname}</div>
      <button type="button" onClick={() => void navigate("/settings")}>
        Open settings
      </button>
      <textarea aria-label="Composer" />
      <div
        aria-label="Rich composer"
        contentEditable
        suppressContentEditableWarning
        tabIndex={0}
      />
      <div data-app-terminal="">
        <div aria-label="Terminal surface" tabIndex={0} />
      </div>
      <div data-app-browser>
        <input aria-label="Browser location" />
      </div>
    </>
  );
}

function renderHarness() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AppCommandProvider>
        <Harness />
      </AppCommandProvider>
    </MemoryRouter>,
  );
}

function pressBracket(
  key: "[" | "]",
  target: EventTarget = window,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    metaKey: true,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function navigateToSettings() {
  act(() => {
    screen.getByRole("button", { name: "Open settings" }).click();
  });
  expect(screen.getByTestId("path").textContent).toBe("/settings");
}

describe("HistoryNavigationCommandHandler", () => {
  afterEach(() => {
    cleanup();
    resetAppRouteHistoryForTest();
    vi.restoreAllMocks();
  });

  it("walks route history with Mod+[ and Mod+]", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    renderHarness();
    navigateToSettings();

    const back = pressBracket("[");
    expect(back.defaultPrevented).toBe(true);
    expect(screen.getByTestId("path").textContent).toBe("/");

    const forward = pressBracket("]");
    expect(forward.defaultPrevented).toBe(true);
    expect(screen.getByTestId("path").textContent).toBe("/settings");
  });

  it("leaves the key to the browser when there is no history entry to visit", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    renderHarness();

    expect(pressBracket("[").defaultPrevented).toBe(false);
    expect(pressBracket("]").defaultPrevented).toBe(false);
    expect(screen.getByTestId("path").textContent).toBe("/");
  });

  it.each([
    ["Composer", "textarea"],
    ["Rich composer", "contenteditable"],
  ])("navigates from the focused %s %s and keeps its focus", (label) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    renderHarness();
    navigateToSettings();
    const editable = screen.getByLabelText(label);
    act(() => {
      editable.focus();
    });

    const event = pressBracket("[", editable);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByTestId("path").textContent).toBe("/");
    expect(document.activeElement).toBe(editable);
  });

  it.each([
    ["Terminal surface", "terminal"],
    ["Browser location", "embedded browser"],
  ])("leaves the chord to the %s guest in the %s", (label) => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    renderHarness();
    navigateToSettings();
    const guest = screen.getByLabelText(label);
    act(() => {
      guest.focus();
    });

    const event = pressBracket("[", guest);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.getByTestId("path").textContent).toBe("/settings");
  });

  it("uses Control instead of Command away from macOS", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    renderHarness();
    navigateToSettings();

    const metaEvent = pressBracket("[");
    expect(metaEvent.defaultPrevented).toBe(false);
    expect(screen.getByTestId("path").textContent).toBe("/settings");

    const controlEvent = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key: "[",
      ctrlKey: true,
    });
    act(() => {
      window.dispatchEvent(controlEvent);
    });
    expect(controlEvent.defaultPrevented).toBe(true);
    expect(screen.getByTestId("path").textContent).toBe("/");
  });
});
