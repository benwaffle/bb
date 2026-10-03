import { describe, expect, it, vi } from "vitest";
import { openTimelineFileTitle } from "./timelineFileTitleOpen";

function open(path: string, diffOpened: boolean) {
  const openDiffFile = vi.fn((_path: string) => diffOpened);
  const openLocalFile = vi.fn();
  openTimelineFileTitle({ openDiffFile, openLocalFile, path });
  return { openDiffFile, openLocalFile };
}

describe("openTimelineFileTitle", () => {
  it("opens workspace-relative paths in the Changes panel", () => {
    const { openDiffFile, openLocalFile } = open("src/app.ts", true);
    expect(openDiffFile).toHaveBeenCalledWith("src/app.ts");
    expect(openLocalFile).not.toHaveBeenCalled();
  });

  it.each(["/home/user/.claude/memory/MEMORY.md", "C:\\Users\\user\\notes.md"])(
    "opens absolute path %s as a local file",
    (path) => {
      const { openDiffFile, openLocalFile } = open(path, true);
      expect(openDiffFile).not.toHaveBeenCalled();
      expect(openLocalFile).toHaveBeenCalledWith({
        lineRange: null,
        openTargetId: null,
        path,
      });
    },
  );

  it("opens relative paths as local files when the Changes panel is unavailable", () => {
    const { openLocalFile } = open("notes/plan.md", false);
    expect(openLocalFile).toHaveBeenCalledWith({
      lineRange: null,
      openTargetId: null,
      path: "notes/plan.md",
    });
  });
});
