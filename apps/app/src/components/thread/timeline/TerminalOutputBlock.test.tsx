// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalOutputBlock } from "./TerminalOutputBlock";

afterEach(() => {
  cleanup();
});

function renderBlock(commandLine: string, output = "") {
  return render(
    <TerminalOutputBlock
      commandLine={commandLine}
      metadataLines={[]}
      output={output}
      exitCode={null}
      streaming={false}
    />,
  );
}

describe("TerminalOutputBlock", () => {
  it("syntax-highlights the command line as shell", () => {
    const commandLine = '$ rg -n "foo" src | head -3 # first hits';
    const { container } = renderBlock(commandLine);
    const highlight = container.querySelector(".bb-code-highlight");
    expect(highlight).not.toBeNull();
    expect(highlight!.querySelector(".sh__token--string")?.textContent).toBe(
      '"foo"',
    );
    expect(highlight!.querySelector(".sh__token--comment")?.textContent).toBe(
      "# first hits",
    );
    expect(highlight!.textContent).toBe(commandLine);
  });

  it("escapes markup in the command line instead of rendering it", () => {
    const commandLine = "$ echo '<img src=x onerror=alert(1)>'";
    const { container } = renderBlock(commandLine);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".bb-code-highlight")?.textContent).toBe(
      commandLine,
    );
  });

  it("separates the output from the command with a divider only when there is output", () => {
    const withOutput = renderBlock("$ ls", "a.txt\nb.txt");
    const divider = withOutput.container.querySelector(".border-t");
    expect(divider).not.toBeNull();
    expect(divider!.textContent).toContain("a.txt");
    cleanup();

    const withoutOutput = renderBlock("$ ls");
    expect(withoutOutput.container.querySelector(".border-t")).toBeNull();
  });
});
