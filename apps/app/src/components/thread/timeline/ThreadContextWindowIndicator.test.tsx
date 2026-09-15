// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ThreadContextWindowUsage } from "@bb/server-contract";
import {
  ThreadContextWindowCard,
  ThreadContextWindowIndicator,
} from "./ThreadContextWindowIndicator";

afterEach(cleanup);

it("shows details when a snapshot arrives and removes them when only aggregate usage remains", () => {
  const usage: ThreadContextWindowUsage = {
    usedTokens: 1000,
    modelContextWindow: 10000,
    estimated: true,
    snapshot: {
      capturedAt: "2026-09-11T00:00:00.000Z",
      providerSessionId: "session",
      providerTurnId: null,
      model: "model",
      usedTokens: 1000,
      contextWindowTokens: 10000,
      autoCompactAtTokens: null,
      estimated: true,
      categories: [
        {
          id: "messages",
          label: "Messages",
          kind: "used",
          tokens: 1000,
          entries: [],
        },
      ],
    },
  };
  const aggregateUsage = {
    usedTokens: usage.usedTokens,
    modelContextWindow: usage.modelContextWindow,
    estimated: usage.estimated,
  };
  const { rerender } = render(
    <ThreadContextWindowCard usage={aggregateUsage} />,
  );
  expect(screen.getByText("10% used")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Show details" })).toBeNull();
  rerender(<ThreadContextWindowCard usage={usage} />);
  fireEvent.click(screen.getByRole("button", { name: "Show details" }));
  expect(screen.getByText("Messages")).toBeTruthy();
  rerender(<ThreadContextWindowCard usage={aggregateUsage} />);
  expect(screen.queryByText("Messages")).toBeNull();
  expect(screen.queryByRole("button", { name: "Hide details" })).toBeNull();
  expect(screen.getByText("10% used")).toBeTruthy();
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
});
