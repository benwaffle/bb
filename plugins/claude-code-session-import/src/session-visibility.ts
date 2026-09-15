export const SESSION_HIDDEN_REASONS = [
  "imported",
  "bb-thread",
  "bb-workspace",
  "thread-workspace",
  "bb-driven-session",
] as const;

export type SessionHiddenReason = (typeof SESSION_HIDDEN_REASONS)[number];

export interface ClassifiableSession {
  sessionId: string;
  cwd: string | null;
  bbDriven: boolean;
}

export interface SessionClassificationContext {
  importedSessionIds: ReadonlySet<string>;
  providerSessionIds: ReadonlySet<string>;
  ownedWorkspacePaths: readonly string[];
  threadIds: ReadonlySet<string>;
}

export function isInsideDirectory(path: string, directory: string): boolean {
  const normalized = directory.endsWith("/")
    ? directory.slice(0, -1)
    : directory;
  if (normalized.length === 0) return false;
  return path === normalized || path.startsWith(`${normalized}/`);
}

export function pathNamesThread(
  path: string,
  threadIds: ReadonlySet<string>,
): boolean {
  for (const segment of path.split("/")) {
    if (segment.length === 0) continue;
    if (threadIds.has(segment)) return true;
    const withoutInstance = segment.replace(/-\d+$/u, "");
    if (withoutInstance !== segment && threadIds.has(withoutInstance)) {
      return true;
    }
  }
  return false;
}

export function sessionHiddenReason(
  session: ClassifiableSession,
  context: SessionClassificationContext,
): SessionHiddenReason | null {
  if (context.importedSessionIds.has(session.sessionId)) return "imported";
  if (context.providerSessionIds.has(session.sessionId)) return "bb-thread";
  const cwd = session.cwd;
  if (cwd !== null) {
    if (
      context.ownedWorkspacePaths.some((path) => isInsideDirectory(cwd, path))
    ) {
      return "bb-workspace";
    }
    if (pathNamesThread(cwd, context.threadIds)) return "thread-workspace";
  }
  if (session.bbDriven) return "bb-driven-session";
  return null;
}

export function describeHiddenReason(reason: SessionHiddenReason): string {
  switch (reason) {
    case "imported":
      return "already imported";
    case "bb-thread":
      return "bb thread";
    case "bb-workspace":
      return "bb workspace";
    case "thread-workspace":
      return "bb thread workspace";
    case "bb-driven-session":
      return "started by bb";
  }
}
