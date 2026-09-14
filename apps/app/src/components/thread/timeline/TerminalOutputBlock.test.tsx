// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TerminalOutputBlock } from "./TerminalOutputBlock";

afterEach(cleanup);

function renderOutput(output: string): HTMLElement {
  const { container } = render(
    <TerminalOutputBlock
      commandLine=""
      exitCode={null}
      metadataLines={[]}
      output={output}
      streaming={false}
    />,
  );
  return container;
}

it("renders control sequences from real CLI output without leaking them as text", () => {
  const container = renderOutput(
    "\u001b[?25l\u001b]0;pnpm test\u0007\u001b]8;;file:///repo/a.ts\u001b\\\u001b[35ma.ts\u001b[0m\u001b]8;;\u001b\\\r\n" +
      "\u001b[1G\u001b[0KProgress 50%\rProgress 100%\u001b(B\r\n\u001b[?25h",
  );

  expect(container.textContent).toBe("a.ts\nProgress 100%\n");
  expect(container.innerHTML).toContain(
    '<span style="color:var(--ansi-5)">a.ts</span>',
  );
});

it("keeps combined and colon-form colours and ignores underline colours", () => {
  const container = renderOutput(
    "\u001b[1;38;5;196mhot\u001b[0m \u001b[38:2::0:128:255mcool\u001b[0m \u001b[4;58;2;255;0;31mwavy\u001b[0m\n",
  );

  expect(container.textContent).toBe("hot cool wavy\n");
  const html = container.innerHTML;
  expect(html).toContain('<b><span style="color:#ff0000">hot</span></b>');
  expect(html).toContain('<span style="color:#0080ff">cool</span>');
  expect(html).toContain("<u>wavy</u>");
  expect(html).not.toContain("var(--ansi-1)");
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
