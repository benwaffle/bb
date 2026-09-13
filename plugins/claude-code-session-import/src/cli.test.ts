import { describe, expect, it } from "vitest";
import { parseImportArgs, parseSessionsArgs } from "./cli.js";

describe("parseSessionsArgs", () => {
  it("reads the flags a listing takes", () => {
    expect(
      parseSessionsArgs(["--dir", "/Users/dev/app", "--all", "--limit", "3"]),
    ).toMatchObject({
      dir: "/Users/dev/app",
      all: true,
      limit: 3,
      json: false,
    });
  });

  it("rejects a flag that swallowed the next flag as its value", () => {
    expect(parseSessionsArgs(["--dir", "--json"])).toBe(
      "--dir needs a directory path",
    );
    expect(parseSessionsArgs(["--machine", "--json"])).toBe(
      "--machine needs a host id",
    );
    expect(parseSessionsArgs(["--limit", "--json"])).toBe(
      "--limit needs a positive integer",
    );
  });
});

describe("parseImportArgs", () => {
  it("rejects a flag that swallowed the next flag as its value", () => {
    expect(parseImportArgs(["some-session", "--project", "--json"])).toBe(
      "--project needs a project id",
    );
  });

  it("keeps a value that merely starts with a dash", () => {
    expect(
      parseImportArgs(["some-session", "--title", "-draft-"]),
    ).toMatchObject({ session: "some-session", title: "-draft-" });
  });
});
