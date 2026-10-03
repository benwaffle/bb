import type {
  ExperimentalFileLocation,
  ExperimentalFileOpenOptions,
} from "@get-bb/plugin-sdk";
import type { ThreadTimelineLocalFileLink } from "@/components/thread/timeline";
import { isLocalDirectoryPath } from "@/components/ui/markdown-local-file-link";
import type { FilePreviewLineRange } from "@bb/client-core";
import { areHostPathsEqual, getRelativeHostPath } from "@bb/domain";
import type { WorkspaceOpenTargetId } from "@bb/host-daemon-contract";
import { normalizeAbsoluteFilePath } from "@bb/shared-ui/lib/absolute-file-path";
import { isRoutePath } from "./route-paths";

const THREAD_LOCAL_FILE_LINK_UNAVAILABLE_DESCRIPTION =
  "Thread file links are only available when the thread has an environment.";
const THREAD_LOCAL_FILE_LINK_INVALID_PATH_DESCRIPTION =
  "Thread file links must use absolute file paths.";
const THREAD_LOCAL_DIRECTORY_LINK_UNAVAILABLE_DESCRIPTION =
  "Folder links open in a file manager, and none is available for this thread.";

interface ResolveThreadLocalFileLinkArgs {
  directoryOpenTargetId: WorkspaceOpenTargetId | null;
  fileOpenTargetIds: readonly WorkspaceOpenTargetId[];
  hostId: string | null;
  link: ThreadTimelineLocalFileLink;
  threadStorage: { rootPath: string; threadId: string } | null;
  threadStorageFilePaths: readonly string[] | null;
  workspace: {
    environmentId: string;
    experimental_ref?: string;
    rootPath: string;
  } | null;
}

export type ThreadLocalFileLinkResolution =
  | { kind: "app-route" }
  | { kind: "error"; description: string }
  | {
      kind: "open-in-target";
      lineRange: FilePreviewLineRange | null;
      path: string;
      targetId: WorkspaceOpenTargetId;
    }
  | {
      kind: "open-directory-in-target";
      path: string;
      targetId: WorkspaceOpenTargetId;
    }
  | {
      kind: "open-thread-storage-directory";
      path: string;
      relativePath: string;
      threadId: string;
    }
  | { kind: "preview"; options: ExperimentalFileOpenOptions };

function isThreadStorageDirectory(
  filePaths: readonly string[] | null,
  relativePath: string,
): boolean {
  if (filePaths === null) {
    const basename = relativePath.split("/").at(-1) ?? "";
    return !basename.includes(".");
  }
  const directoryPrefix = `${relativePath}/`;
  return filePaths.some((filePath) => filePath.startsWith(directoryPrefix));
}

export function toFileOpenLocation(
  lineRange: FilePreviewLineRange | null,
): ExperimentalFileLocation | null {
  return lineRange === null
    ? null
    : {
        kind: "range",
        startLine: lineRange.startLineNumber,
        endLine: lineRange.endLineNumber,
      };
}

function relativePathWithinRoot(path: string, rootPath: string): string | null {
  if (areHostPathsEqual(path, rootPath)) return null;
  const relativePath = getRelativeHostPath({ rootPath, candidatePath: path });
  return relativePath === null || relativePath === "" ? null : relativePath;
}

export function resolveThreadLocalFileLink({
  directoryOpenTargetId,
  fileOpenTargetIds,
  hostId,
  link,
  threadStorage,
  threadStorageFilePaths,
  workspace,
}: ResolveThreadLocalFileLinkArgs): ThreadLocalFileLinkResolution {
  if (isRoutePath({ path: link.path })) {
    return { kind: "app-route" };
  }

  const path = normalizeAbsoluteFilePath({ path: link.path });
  if (!path) {
    return {
      description: THREAD_LOCAL_FILE_LINK_INVALID_PATH_DESCRIPTION,
      kind: "error",
    };
  }

  if (
    link.openTargetId !== null &&
    fileOpenTargetIds.includes(link.openTargetId)
  ) {
    return {
      kind: "open-in-target",
      lineRange: link.lineRange,
      path,
      targetId: link.openTargetId,
    };
  }

  const location = toFileOpenLocation(link.lineRange);
  const isDirectoryLink = isLocalDirectoryPath({ path: link.path });
  const workspacePath =
    isDirectoryLink || workspace === null
      ? null
      : relativePathWithinRoot(path, workspace.rootPath);
  if (workspace !== null && workspacePath !== null) {
    return {
      kind: "preview",
      options: {
        target: {
          kind: "workspace",
          environmentId: workspace.environmentId,
          path: workspacePath,
          ...(workspace.experimental_ref === undefined
            ? {}
            : { experimental_ref: workspace.experimental_ref }),
        },
        location,
      },
    };
  }

  const storageRootPath =
    threadStorage === null
      ? null
      : (normalizeAbsoluteFilePath({ path: threadStorage.rootPath }) ??
        threadStorage.rootPath);
  if (
    threadStorage !== null &&
    storageRootPath !== null &&
    areHostPathsEqual(path, storageRootPath)
  ) {
    return {
      kind: "open-thread-storage-directory",
      path: storageRootPath,
      relativePath: "",
      threadId: threadStorage.threadId,
    };
  }

  const storagePath =
    threadStorage === null
      ? null
      : relativePathWithinRoot(path, threadStorage.rootPath);
  if (
    threadStorage !== null &&
    storagePath !== null &&
    (isDirectoryLink ||
      isThreadStorageDirectory(threadStorageFilePaths, storagePath))
  ) {
    return {
      kind: "open-thread-storage-directory",
      path,
      relativePath: storagePath,
      threadId: threadStorage.threadId,
    };
  }
  if (threadStorage !== null && storagePath !== null) {
    return {
      kind: "preview",
      options: {
        target: {
          kind: "thread-storage",
          threadId: threadStorage.threadId,
          path: storagePath,
        },
        location,
      },
    };
  }

  if (isDirectoryLink) {
    return directoryOpenTargetId === null
      ? {
          description: THREAD_LOCAL_DIRECTORY_LINK_UNAVAILABLE_DESCRIPTION,
          kind: "error",
        }
      : {
          kind: "open-directory-in-target",
          path,
          targetId: directoryOpenTargetId,
        };
  }

  if (hostId === null) {
    return {
      description: THREAD_LOCAL_FILE_LINK_UNAVAILABLE_DESCRIPTION,
      kind: "error",
    };
  }

  return {
    kind: "preview",
    options: { target: { kind: "host", hostId, path }, location },
  };
}
