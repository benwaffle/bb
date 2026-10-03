import { describe, expect, it } from "vitest";
import { resolveThreadLocalFileLink } from "./thread-local-file-links";

describe("resolveThreadLocalFileLink", () => {
  it("leaves app routes as normal navigation", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: null,
          openTargetId: null,
          path: "/projects/proj_gyz9przugq/threads/thr_rq7r4uv8zg",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "/Users/me/project",
      }),
    ).toEqual({
      kind: "app-route",
    });
  });

  it("opens host file links when there is no ready local workspace", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: null,
          openTargetId: null,
          path: "/Users/me/project/src/file.ts",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: null,
      }),
    ).toEqual({
      kind: "open-host-path",
      request: {
        lineRange: null,
        path: "/Users/me/project/src/file.ts",
      },
    });
  });

  it("rejects file links when host-file context is unavailable", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: false,
        link: {
          lineRange: { startLineNumber: 12, endLineNumber: 14 },
          openTargetId: null,
          path: "/Users/me/.ssh/id_rsa",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "/Users/me/project",
      }),
    ).toEqual({
      description:
        "Thread file links are only available when the thread has an environment.",
      kind: "error",
    });
  });

  it("opens paths outside the workspace root as host files", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: { startLineNumber: 12, endLineNumber: 14 },
          openTargetId: null,
          path: "/Users/me/.ssh/id_rsa",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "/Users/me/project",
      }),
    ).toEqual({
      kind: "open-host-path",
      request: {
        lineRange: { startLineNumber: 12, endLineNumber: 14 },
        path: "/Users/me/.ssh/id_rsa",
      },
    });
  });

  it("normalizes paths before checking workspace containment", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: { startLineNumber: 12, endLineNumber: 14 },
          openTargetId: null,
          path: "/Users/me/project/src/../src/file.ts",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "/Users/me/project/",
      }),
    ).toEqual({
      kind: "open-workspace-path",
      request: {
        lineRange: { startLineNumber: 12, endLineNumber: 14 },
        path: "/Users/me/project/src/file.ts",
        relativePath: "src/file.ts",
        workspaceRootPath: "/Users/me/project",
      },
    });
  });

  it("opens a Windows path inside the workspace in any spelling", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: null,
          openTargetId: null,
          path: "c:/src/Repo/packages/app/file.ts",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "C:\\src\\repo",
      }),
    ).toEqual({
      kind: "open-workspace-path",
      request: {
        lineRange: null,
        path: "C:\\src\\Repo\\packages\\app\\file.ts",
        relativePath: "packages/app/file.ts",
        workspaceRootPath: "C:\\src\\repo",
      },
    });
  });

  it("rejects relative file links", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: { startLineNumber: 7, endLineNumber: 7 },
          openTargetId: null,
          path: "apps/app/src/main.tsx",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "/Users/me/project",
      }),
    ).toEqual({
      description: "Thread file links must use absolute file paths.",
      kind: "error",
    });
  });

  it("does not mistake deeper filesystem paths for project routes", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: null,
          openTargetId: null,
          path: "/projects/my-repo/src/file.ts",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: null,
        workspaceRootPath: "/projects/my-repo",
      }),
    ).toEqual({
      kind: "open-workspace-path",
      request: {
        lineRange: null,
        path: "/projects/my-repo/src/file.ts",
        relativePath: "src/file.ts",
        workspaceRootPath: "/projects/my-repo",
      },
    });
  });

  it("opens paths inside the known thread storage root as storage files", () => {
    expect(
      resolveThreadLocalFileLink({
        fileOpenTargetIds: [],
        directoryOpenTargetId: null,
        hostFileLinksAvailable: true,
        link: {
          lineRange: { startLineNumber: 4, endLineNumber: 6 },
          openTargetId: null,
          path: "/Users/me/.bb/thread-storage/thr_one/reports/preview.html",
        },
        threadStorageFilePaths: null,
        threadStorageRootPath: "/Users/me/.bb/thread-storage/thr_one",
        workspaceRootPath: "/Users/me/project",
      }),
    ).toEqual({
      kind: "open-thread-storage-path",
      request: {
        lineRange: { startLineNumber: 4, endLineNumber: 6 },
        path: "/Users/me/.bb/thread-storage/thr_one/reports/preview.html",
        relativePath: "reports/preview.html",
        threadStorageRootPath: "/Users/me/.bb/thread-storage/thr_one",
      },
    });
  });

  it("opens editor links in the editor they name when it is available", () => {
    const link = {
      lineRange: { startLineNumber: 12, endLineNumber: 12 },
      openTargetId: "devin-desktop",
      path: "/Users/me/project/src/../review.diff",
    };
    const args = {
      directoryOpenTargetId: null,
      hostFileLinksAvailable: true,
      link,
      threadStorageFilePaths: null,
      threadStorageRootPath: null,
      workspaceRootPath: "/Users/me/project",
    };

    expect(
      resolveThreadLocalFileLink({
        ...args,
        fileOpenTargetIds: ["vscode", "devin-desktop"],
      }),
    ).toEqual({
      kind: "open-in-target",
      request: {
        lineRange: { startLineNumber: 12, endLineNumber: 12 },
        path: "/Users/me/project/review.diff",
        targetId: "devin-desktop",
      },
    });
    expect(
      resolveThreadLocalFileLink({ ...args, fileOpenTargetIds: ["vscode"] }),
    ).toEqual({
      kind: "open-workspace-path",
      request: {
        lineRange: { startLineNumber: 12, endLineNumber: 12 },
        path: "/Users/me/project/review.diff",
        relativePath: "review.diff",
        workspaceRootPath: "/Users/me/project",
      },
    });
  });

  describe("folder links", () => {
    const storageRoot = "/Users/me/.bb/thread-storage/thr_one";
    const baseArgs = {
      directoryOpenTargetId: null,
      fileOpenTargetIds: [],
      hostFileLinksAvailable: true,
      threadStorageFilePaths: null,
      threadStorageRootPath: storageRoot,
      workspaceRootPath: "/Users/me/project",
    };
    const linkTo = (path: string) => ({
      lineRange: null,
      openTargetId: null,
      path,
    });

    it.each([
      [`${storageRoot}/imsi-rotation-pcaps`, null, "imsi-rotation-pcaps"],
      [`${storageRoot}/reports/`, ["reports.md"], "reports"],
      [`${storageRoot}/pcaps.v2`, ["pcaps.v2/a.pcap"], "pcaps.v2"],
      [storageRoot, null, ""],
    ])(
      "opens storage folder %s in the storage browser",
      (path, threadStorageFilePaths, relativePath) => {
        expect(
          resolveThreadLocalFileLink({
            ...baseArgs,
            link: linkTo(path),
            threadStorageFilePaths,
          }),
        ).toEqual({
          kind: "open-thread-storage-directory",
          request: {
            path:
              relativePath === ""
                ? storageRoot
                : `${storageRoot}/${relativePath}`,
            relativePath,
          },
        });
      },
    );

    it("previews extensionless storage files the file list knows about", () => {
      expect(
        resolveThreadLocalFileLink({
          ...baseArgs,
          link: linkTo(`${storageRoot}/Makefile`),
          threadStorageFilePaths: ["Makefile", "notes/plan.md"],
        }),
      ).toMatchObject({
        kind: "open-thread-storage-path",
        request: { relativePath: "Makefile" },
      });
    });

    it("reveals trailing-slash folders outside storage in the file manager", () => {
      const link = linkTo("/Users/me/project/src/");
      expect(
        resolveThreadLocalFileLink({
          ...baseArgs,
          directoryOpenTargetId: "finder",
          link,
        }),
      ).toEqual({
        kind: "open-directory-in-target",
        request: { path: "/Users/me/project/src", targetId: "finder" },
      });
      expect(resolveThreadLocalFileLink({ ...baseArgs, link })).toMatchObject({
        kind: "error",
      });
    });
  });
});
