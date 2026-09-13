export const DEFAULT_SERVER_URL = "http://127.0.0.1:38886";
const THREAD_LIST_LIMIT = 300;
const SEARCH_LIMIT_PER_GROUP = 20;

export async function loadSettings() {
  const stored = await chrome.storage.local.get(["serverUrl", "apiToken"]);
  return {
    serverUrl: normalizeServerUrl(stored.serverUrl) ?? DEFAULT_SERVER_URL,
    apiToken: typeof stored.apiToken === "string" ? stored.apiToken.trim() : "",
  };
}

export async function saveSettings({ serverUrl, apiToken }) {
  await chrome.storage.local.set({
    serverUrl: normalizeServerUrl(serverUrl) ?? DEFAULT_SERVER_URL,
    apiToken: apiToken.trim(),
  });
}

export function normalizeServerUrl(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export class BbApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function describeError(error, settings) {
  if (error instanceof BbApiError) {
    if (error.status === 401) {
      return "bb rejected the API token. Update it in the extension options.";
    }
    if (error.status === 403) {
      return "bb refused the request origin. This extension needs a bb server that accepts bearer-authenticated requests from extensions.";
    }
    return `bb returned HTTP ${error.status}: ${error.message}`;
  }
  if (error instanceof TypeError) {
    return `Could not reach bb at ${settings.serverUrl}. Is the desktop app running?`;
  }
  return error instanceof Error ? error.message : String(error);
}

async function apiFetch(settings, path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${settings.apiToken}`);
  if (init.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  const response = await fetch(new URL(`/api/v1${path}`, settings.serverUrl), {
    ...init,
    headers,
  });
  if (!response.ok) {
    let message = response.statusText;
    try {
      const body = await response.json();
      if (typeof body?.error === "string") {
        message = body.error;
      } else if (typeof body?.message === "string") {
        message = body.message;
      }
    } catch {}
    throw new BbApiError(response.status, message);
  }
  return response.json();
}

export function testConnection(settings) {
  return apiFetch(settings, "/threads/count");
}

function repoNameOfPath(environmentPath) {
  if (typeof environmentPath !== "string") {
    return null;
  }
  const segments = environmentPath.split(/[\\/]/u).filter((s) => s.length > 0);
  return segments.length === 0 ? null : segments[segments.length - 1];
}

async function threadIdsMentioning(settings, prUrl) {
  const params = new URLSearchParams({
    query: prUrl,
    limitPerGroup: String(SEARCH_LIMIT_PER_GROUP),
  });
  const response = await apiFetch(settings, `/threads/search?${params}`);
  const ids = new Set();
  for (const group of [response.active, response.archived]) {
    for (const result of group?.results ?? []) {
      const quotesUrl = result.matches.some((match) =>
        match.text.toLowerCase().includes(prUrl.toLowerCase()),
      );
      if (quotesUrl) {
        ids.add(result.thread.id);
      }
    }
  }
  return ids;
}

function toCandidate(thread, mentioning) {
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title ?? thread.titleFallback ?? thread.id,
    status: thread.status,
    branch: thread.environmentBranchName,
    updatedAt: thread.updatedAt,
    mentionsPullRequest: mentioning.has(thread.id),
  };
}

async function threadNamedInBranch(settings, threadId) {
  if (threadId === null || threadId === undefined) {
    return null;
  }
  try {
    return await apiFetch(settings, `/threads/${encodeURIComponent(threadId)}`);
  } catch (error) {
    if (error instanceof BbApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function findPullRequestThreads(
  settings,
  { repo, branch, threadId, prUrl },
) {
  const named = await threadNamedInBranch(settings, threadId);
  if (named !== null) {
    return [toCandidate(named, new Set())];
  }
  const params = new URLSearchParams({ limit: String(THREAD_LIST_LIMIT) });
  const [threads, mentioning] = await Promise.all([
    apiFetch(settings, `/threads?${params}`),
    threadIdsMentioning(settings, prUrl),
  ]);
  const onBranch = threads.filter(
    (thread) => thread.environmentBranchName === branch,
  );
  const inRepo = onBranch.filter(
    (thread) =>
      repoNameOfPath(thread.environmentPath)?.toLowerCase() ===
      repo.toLowerCase(),
  );
  const candidates = inRepo.length > 0 ? inRepo : onBranch;
  const mentionedOffBranch = threads.filter(
    (thread) =>
      mentioning.has(thread.id) &&
      !candidates.some((candidate) => candidate.id === thread.id),
  );
  return [...candidates, ...mentionedOffBranch]
    .map((thread) => toCandidate(thread, mentioning))
    .sort((a, b) => {
      if (a.mentionsPullRequest !== b.mentionsPullRequest) {
        return a.mentionsPullRequest ? -1 : 1;
      }
      return b.updatedAt - a.updatedAt;
    });
}

export async function openThreadInBb(settings, thread) {
  const result = await apiFetch(
    settings,
    `/threads/${encodeURIComponent(thread.id)}/open`,
    { method: "POST", body: JSON.stringify({ file: null, focus: true }) },
  );
  if (result.delivered) {
    return { where: "desktop" };
  }
  const threadPath = `/projects/${encodeURIComponent(thread.projectId)}/threads/${encodeURIComponent(thread.id)}`;
  const session = new URL("/auth/session", settings.serverUrl);
  session.searchParams.set("token", settings.apiToken);
  session.searchParams.set("next", threadPath);
  return { where: "browser", url: session.toString() };
}
