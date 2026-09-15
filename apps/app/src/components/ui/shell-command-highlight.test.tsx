// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ShellCommandHighlight } from "./shell-command-highlight";

const stylesheet = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "markdown-code-highlight.css"),
  "utf8",
);

function injectPalette(): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = stylesheet;
  document.head.append(style);
  return style;
}

afterEach(() => {
  cleanup();
  document.head.querySelectorAll("style").forEach((style) => style.remove());
});

describe("ShellCommandHighlight", () => {
  it("renders the shell lexer's tokens inside the palette scope", () => {
    const { container } = render(
      <ShellCommandHighlight command={'echo "hi" # note'} />,
    );
    const block = container.querySelector(".bb-code-highlight");
    expect(block?.textContent).toBe('echo "hi" # note');
    expect(block?.querySelector(".sh__token--string")?.textContent).toBe(
      '"hi"',
    );
  });

  it("lets flowing lines wrap inline so a line clamp can cut them", () => {
    injectPalette();
    const { container } = render(
      <>
        <ShellCommandHighlight command="sleep 1" />
        <ShellCommandHighlight command="sleep 2" flowingLines />
      </>,
    );
    const [blockLine, flowingLine] = Array.from(
      container.querySelectorAll<HTMLElement>(".sh__line"),
    );
    expect(getComputedStyle(blockLine!).display).toBe("inline-block");
    expect(getComputedStyle(flowingLine!).display).toBe("inline");
  });
});
