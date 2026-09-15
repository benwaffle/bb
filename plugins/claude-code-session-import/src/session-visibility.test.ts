import { describe, expect, it } from "vitest";
import {
  describeHiddenReason,
  isInsideDirectory,
  pathNamesThread,
  sessionHiddenReason,
  type ClassifiableSession,
} from "./session-visibility.js";

const SESSION_ID = "0f1e2d3c-4b5a-4978-8a6b-5c4d3e2f1a0b";
const THREAD_ID = "thr_a3zzvuvmqb";
const WORKSPACE =
  "/Users/dev/.bb/plugins/environment-personal-workspace/host-data/workspaces/thr_a3zzvuvmqb";
const WORKTREE =
  "/Users/dev/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_a3zzvuvmqb-1/bb";

function session(
  overrides: Partial<ClassifiableSession> = {},
): ClassifiableSession {
  return {
    sessionId: SESSION_ID,
    cwd: "/Users/dev/app",
    bbDriven: false,
    ...overrides,
  };
}

const NOTHING_IN_BB = {
  importedSessionIds: new Set<string>(),
  providerSessionIds: new Set<string>(),
  ownedWorkspacePaths: [] as readonly string[],
  threadIds: new Set<string>(),
};

describe("isInsideDirectory", () => {
  it("accepts the directory itself and its descendants", () => {
    expect(isInsideDirectory("/a/b", "/a/b")).toBe(true);
    expect(isInsideDirectory("/a/b/c", "/a/b")).toBe(true);
    expect(isInsideDirectory("/a/b/c", "/a/b/")).toBe(true);
  });

  it("rejects a sibling whose name merely starts with the directory", () => {
    expect(isInsideDirectory("/a/bc", "/a/b")).toBe(false);
    expect(isInsideDirectory("/a", "/a/b")).toBe(false);
  });

  it("rejects an empty or root directory instead of matching everything", () => {
    expect(isInsideDirectory("/a/b", "")).toBe(false);
    expect(isInsideDirectory("/a/b", "/")).toBe(false);
  });
});

describe("sessionHiddenReason", () => {
  it("keeps a terminal session bb has no thread for visible", () => {
    expect(sessionHiddenReason(session(), NOTHING_IN_BB)).toBe(null);
  });

  it("hides a session this plugin already imported", () => {
    expect(
      sessionHiddenReason(session(), {
        ...NOTHING_IN_BB,
        importedSessionIds: new Set([SESSION_ID]),
      }),
    ).toBe("imported");
  });

  it("hides a session a bb thread already holds", () => {
    expect(
      sessionHiddenReason(session(), {
        ...NOTHING_IN_BB,
        providerSessionIds: new Set([SESSION_ID]),
      }),
    ).toBe("bb-thread");
  });

  it("hides a session bb held before the thread that owned it was deleted", () => {
    expect(
      sessionHiddenReason(session(), {
        ...NOTHING_IN_BB,
        providerSessionIds: new Set([SESSION_ID]),
      }),
    ).toBe("bb-thread");
  });

  it("hides an unknown session that ran in a workspace bb provisioned", () => {
    expect(
      sessionHiddenReason(session({ cwd: WORKSPACE }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [WORKSPACE],
      }),
    ).toBe("bb-workspace");
  });

  it("hides an unknown session nested under a workspace bb provisioned", () => {
    expect(
      sessionHiddenReason(session({ cwd: `${WORKSPACE}/packages/web` }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [WORKSPACE],
      }),
    ).toBe("bb-workspace");
  });

  it("leaves a terminal session in an attached checkout visible", () => {
    expect(
      sessionHiddenReason(session({ cwd: "/Users/dev/bb" }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [WORKSPACE],
      }),
    ).toBe(null);
  });

  it("leaves a session with no directory visible unless an id matches", () => {
    expect(
      sessionHiddenReason(session({ cwd: null }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [WORKSPACE],
      }),
    ).toBe(null);
  });

  it("does not hide a session whose id merely resembles one bb holds", () => {
    expect(
      sessionHiddenReason(session(), {
        ...NOTHING_IN_BB,
        providerSessionIds: new Set([`${SESSION_ID}-fork`]),
      }),
    ).toBe(null);
  });

  it("prefers the import, then the thread, over the workspace", () => {
    const everything = {
      importedSessionIds: new Set([SESSION_ID]),
      providerSessionIds: new Set([SESSION_ID]),
      ownedWorkspacePaths: [WORKSPACE],
      threadIds: new Set([THREAD_ID]),
    };
    expect(sessionHiddenReason(session({ cwd: WORKSPACE }), everything)).toBe(
      "imported",
    );
    expect(
      sessionHiddenReason(session({ cwd: WORKSPACE }), {
        ...everything,
        importedSessionIds: new Set<string>(),
      }),
    ).toBe("bb-thread");
  });
});

describe("pathNamesThread", () => {
  const threadIds = new Set([THREAD_ID]);

  it("matches a workspace directory named after the thread", () => {
    expect(pathNamesThread(WORKSPACE, threadIds)).toBe(true);
  });

  it("matches a worktree directory with an instance suffix", () => {
    expect(pathNamesThread(WORKTREE, threadIds)).toBe(true);
  });

  it("ignores a directory whose name merely contains a thread id", () => {
    expect(
      pathNamesThread(`/Users/dev/notes-${THREAD_ID}-draft`, threadIds),
    ).toBe(false);
  });

  it("ignores a thread id bb does not have", () => {
    expect(pathNamesThread(WORKSPACE, new Set(["thr_other"]))).toBe(false);
  });

  it("leaves an ordinary checkout alone", () => {
    expect(pathNamesThread("/Users/dev/bb", threadIds)).toBe(false);
  });
});

describe("sessionHiddenReason with a destroyed environment", () => {
  it("hides a session in a thread's workspace when the environment row has no path", () => {
    expect(
      sessionHiddenReason(session({ cwd: WORKSPACE }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [],
        threadIds: new Set([THREAD_ID]),
      }),
    ).toBe("thread-workspace");
  });

  it("hides a worktree session with an instance suffix the same way", () => {
    expect(
      sessionHiddenReason(session({ cwd: WORKTREE }), {
        ...NOTHING_IN_BB,
        threadIds: new Set([THREAD_ID]),
      }),
    ).toBe("thread-workspace");
  });

  it("prefers the environment row when it still has the path", () => {
    expect(
      sessionHiddenReason(session({ cwd: WORKSPACE }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [WORKSPACE],
        threadIds: new Set([THREAD_ID]),
      }),
    ).toBe("bb-workspace");
  });

  it("still leaves an attached checkout visible", () => {
    expect(
      sessionHiddenReason(session({ cwd: "/Users/dev/bb" }), {
        ...NOTHING_IN_BB,
        threadIds: new Set([THREAD_ID]),
      }),
    ).toBe(null);
  });
});

describe("sessionHiddenReason with a session from another bb instance", () => {
  const DEV_WORKSPACE =
    "/Users/dev/.bb-dev/bb-plugins-environment-git-worktree-host-data-worktrees-thr_7vjhgn6teq-1-bb-ce8894b5d554/plugins/environment-personal-workspace/host-data/workspaces/thr_3v5t47a7tu";

  it("hides a session whose thread lives in a dev instance's database", () => {
    expect(
      sessionHiddenReason(session({ cwd: DEV_WORKSPACE, bbDriven: true }), {
        ...NOTHING_IN_BB,
        threadIds: new Set([THREAD_ID]),
      }),
    ).toBe("bb-driven-session");
  });

  it("hides a bb-driven session whose transcript records no directory", () => {
    expect(
      sessionHiddenReason(session({ cwd: null, bbDriven: true }), NOTHING_IN_BB),
    ).toBe("bb-driven-session");
  });

  it("prefers this instance's own signals over the transcript marker", () => {
    expect(
      sessionHiddenReason(session({ cwd: WORKSPACE, bbDriven: true }), {
        ...NOTHING_IN_BB,
        ownedWorkspacePaths: [WORKSPACE],
      }),
    ).toBe("bb-workspace");
  });

  it("leaves a terminal session in a directory that merely mentions a thread id visible", () => {
    expect(
      sessionHiddenReason(session({ cwd: `/Users/dev/thr_notes` }), {
        ...NOTHING_IN_BB,
        threadIds: new Set([THREAD_ID]),
      }),
    ).toBe(null);
  });

  it("leaves a terminal session in an unrelated workspaces directory visible", () => {
    expect(
      sessionHiddenReason(
        session({ cwd: "/Users/dev/scratch/workspaces/thr_notmine" }),
        { ...NOTHING_IN_BB, threadIds: new Set([THREAD_ID]) },
      ),
    ).toBe(null);
  });
});

describe("describeHiddenReason", () => {
  it("labels every reason", () => {
    expect(describeHiddenReason("imported")).toBe("already imported");
    expect(describeHiddenReason("bb-thread")).toBe("bb thread");
    expect(describeHiddenReason("bb-workspace")).toBe("bb workspace");
    expect(describeHiddenReason("thread-workspace")).toBe(
      "bb thread workspace",
    );
    expect(describeHiddenReason("bb-driven-session")).toBe("started by bb");
  });
});
