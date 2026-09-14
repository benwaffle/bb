// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ExpandableTimelineRow } from "./ExpandableTimelineRow";
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
  it("reveals the complete command with the outer timeline row", () => {
    const commandLine = [
      "$ run-task \\",
      "  --first-option alpha \\",
      "  --second-option beta \\",
      "  --third-option gamma",
    ].join("\n");

    render(
      <ExpandableTimelineRow
        title={{
          segments: [],
          decorations: [],
          tone: "default",
          action: null,
          plain: "Ran command",
        }}
        titleContent="Ran command"
        renderBody={() => (
          <TerminalOutputBlock
            commandLine={commandLine}
            exitCode={null}
            metadataLines={[]}
            output="done"
            streaming={false}
          />
        )}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ran command" }));

    const renderedCommand = screen.getByText(
      (_, element) =>
        element?.childNodes.length === 1 &&
        element.textContent === commandLine,
    );
    expect(renderedCommand.closest("button")).toBeNull();
    expect(renderedCommand.className).not.toContain("max-h-[2lh]");
    expect(renderedCommand.style.webkitLineClamp).toBe("");
  });

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
