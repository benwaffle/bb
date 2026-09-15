// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ThreadContextWindowIndicator } from "./ThreadContextWindowIndicator";

afterEach(cleanup);

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
});
