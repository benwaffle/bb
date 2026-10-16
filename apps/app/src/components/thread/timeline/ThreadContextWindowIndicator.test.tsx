// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ThreadContextWindowIndicator } from "./ThreadContextWindowIndicator";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("renders context usage as used-over-total text and keeps the breakdown in the hover card", () => {
  render(
    <ThreadContextWindowIndicator
      usage={{
        usedTokens: 370_000,
        modelContextWindow: 1_000_000,
        estimated: false,
        snapshot: {
          capturedAt: "2026-09-15T00:00:00.000Z",
          providerSessionId: "session",
          providerTurnId: null,
          model: "claude-opus-5",
          usedTokens: 370_000,
          contextWindowTokens: 1_000_000,
          autoCompactAtTokens: null,
          estimated: false,
          categories: [
            {
              id: "messages",
              label: "Messages",
              kind: "used",
              tokens: 370_000,
              entries: [],
            },
          ],
        },
      }}
      defaultOpen
    />,
  );

  const trigger = screen.getByRole("button", { name: /Context window/ });
  expect(trigger.textContent).toBe("370k/1m");
  expect(trigger.querySelector("svg")).toBeNull();
  expect(screen.getByText("37% used")).toBeTruthy();
  expect(screen.getByText("Messages")).toBeTruthy();
  expect(screen.queryByText(/As of last turn/)).toBeNull();
});

it("offers a breakdown from the last turn while a newer estimate is shown", () => {
  vi.useFakeTimers({ now: Date.parse("2026-09-15T00:04:30.000Z") });
  render(
    <ThreadContextWindowIndicator
      usage={{
        usedTokens: 420_000,
        modelContextWindow: 1_000_000,
        estimated: true,
        snapshot: {
          capturedAt: "2026-09-15T00:00:00.000Z",
          providerSessionId: "session",
          providerTurnId: null,
          model: "claude-opus-5",
          usedTokens: 370_000,
          contextWindowTokens: 1_000_000,
          autoCompactAtTokens: null,
          estimated: false,
          categories: [
            {
              id: "messages",
              label: "Messages",
              kind: "used",
              tokens: 370_000,
              entries: [],
            },
          ],
        },
      }}
      defaultOpen
    />,
  );

  expect(screen.getByText("42% used")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Show details" })).toBeTruthy();
  expect(screen.getByText("As of last turn, 4 min ago")).toBeTruthy();
});
