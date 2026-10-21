// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThreadModelFallbackCard } from "./ThreadModelFallbackCard";

const fallback = {
  sourceSeq: 42,
  detectedAt: 123,
  originalModel: "claude-fable-5",
  fallbackModel: "claude-opus-4-8",
  reason: "refusal" as const,
  message: "Fable refused this request. Switched to Opus.",
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ThreadModelFallbackCard", () => {
  it("renders as a compact prompt-stack card and persists dismissal", () => {
    const first = render(
      <ThreadModelFallbackCard fallback={fallback} threadId="thread-1" />,
    );

    expect(screen.getByText("Model fallback")).toBeTruthy();
    expect(
      screen.getByText("Switched to Opus 4.8: safeguards flagged the request"),
    ).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Dismiss model fallback" }),
    );
    expect(screen.queryByText("Model fallback")).toBeNull();

    first.unmount();
    render(<ThreadModelFallbackCard fallback={fallback} threadId="thread-1" />);
    expect(screen.queryByText("Model fallback")).toBeNull();
  });

  it("names a provider fallback reason and keeps the raw provider message on hover", () => {
    render(
      <ThreadModelFallbackCard
        fallback={{
          ...fallback,
          reason: "provider",
          message: "Opus 5 is overloaded. Switched to Opus 4.8.",
        }}
        threadId="thread-1"
      />,
    );

    const summary = screen.getByText(
      "Switched to Opus 4.8: the original model was unavailable",
    );
    expect(summary.getAttribute("title")).toBe(
      "Opus 5 is overloaded. Switched to Opus 4.8.",
    );
  });

  it("shows a later fallback occurrence after an earlier one was dismissed", () => {
    window.localStorage.setItem(
      "bb.thread.model-fallback-dismissed.thread-1",
      "42",
    );

    render(
      <ThreadModelFallbackCard
        fallback={{ ...fallback, sourceSeq: 43 }}
        threadId="thread-1"
      />,
    );
    expect(screen.getByText("Model fallback")).toBeTruthy();
  });
});
