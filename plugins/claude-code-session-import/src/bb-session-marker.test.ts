import { describe, expect, it } from "vitest";
import { recordShowsBbSession } from "./bb-session-marker.js";

describe("recordShowsBbSession", () => {
  it("recognizes the bb bridge tool bb adds to a session", () => {
    expect(
      recordShowsBbSession({
        type: "attachment",
        attachment: {
          type: "deferred_tools_delta",
          addedNames: [
            "WebSearch",
            "mcp__bb-bridge__update_environment_directory",
          ],
          removedNames: [],
        },
      }),
    ).toBe(true);
  });

  it("recognizes the bb bridge tool once it is hidden again", () => {
    expect(
      recordShowsBbSession({
        type: "attachment",
        attachment: {
          type: "deferred_tools_delta",
          addedNames: [],
          removedNames: ["mcp__bb-bridge__update_environment_directory"],
        },
      }),
    ).toBe(true);
  });

  it("recognizes the plugin instructions bb appends to the system prompt", () => {
    expect(
      recordShowsBbSession({
        type: "attachment",
        attachment: {
          type: "prompt_snapshot",
          systemPrompt: [
            "You are Claude Code.",
            'The following instructions come from the BB plugin "bb-guide":\n\nYou are working inside bb.',
          ],
          tools: [{ name: "Read" }],
        },
      }),
    ).toBe(true);
  });

  it("recognizes the bb bridge tool listed in a prompt snapshot", () => {
    expect(
      recordShowsBbSession({
        type: "attachment",
        attachment: {
          type: "prompt_snapshot",
          systemPrompt: ["You are Claude Code."],
          tools: [
            { name: "Read" },
            { name: "mcp__bb-bridge__update_environment_directory" },
          ],
        },
      }),
    ).toBe(true);
  });

  it("recognizes a call to a bb bridge tool", () => {
    expect(
      recordShowsBbSession({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Moving the thread." },
            {
              type: "tool_use",
              name: "mcp__bb-bridge__update_environment_directory",
              input: {},
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("ignores a conversation that merely talks about bb", () => {
    expect(
      recordShowsBbSession({
        type: "user",
        message: {
          role: "user",
          content: [
            {
              type: "text",
              text: 'bb exposes mcp__bb-bridge__update_environment_directory and appends "instructions come from the BB plugin" to the prompt.',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it("ignores a plain terminal session record", () => {
    expect(
      recordShowsBbSession({
        type: "user",
        cwd: "/Users/dev/app",
        entrypoint: "cli",
        message: { role: "user", content: "run the tests" },
      }),
    ).toBe(false);
  });

  it("ignores another tool's MCP server", () => {
    expect(
      recordShowsBbSession({
        type: "attachment",
        attachment: {
          type: "deferred_tools_delta",
          addedNames: ["mcp__other-bridge__do_something"],
        },
      }),
    ).toBe(false);
  });
});
