import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBackgroundCommandOutputTail } from "./background-command-output.js";

const dirs: string[] = [];

function tempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "bb-bg-output-"));
  dirs.push(dir);
  const file = join(dir, "task.output");
  writeFileSync(file, content);
  return file;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readBackgroundCommandOutputTail", () => {
  it("returns undefined while the harness has not created the file", () => {
    expect(
      readBackgroundCommandOutputTail(join(tmpdir(), "missing", "x.output")),
    ).toBeUndefined();
  });

  it("returns the whole file when it fits", () => {
    expect(readBackgroundCommandOutputTail(tempFile("tick 1\ntick 2\n"))).toBe(
      "tick 1\ntick 2\n",
    );
  });

  it("keeps only whole trailing lines once the file exceeds the cap", () => {
    const file = tempFile("first line\nsecond line\nthird line\n");
    expect(readBackgroundCommandOutputTail(file, 18)).toBe("third line\n");
  });
});
