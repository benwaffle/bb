import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  AUTOMATIC_THREAD_LIST_PROVIDER,
  CLASSIC_THREAD_LIST_PROVIDER,
  DEFAULT_SIDEBAR_LAYOUT,
  inboxRpcContract,
  inboxThreadListProvider,
  isSidebarLayout,
  PROJECT_ICONS_CHANGED_CHANNEL,
  SIDEBAR_LAYOUTS,
  THREAD_LIST_PROVIDER_PREFERENCE,
  type PendingInteractionKind,
  type SidebarLayout,
} from "./shared/contract.js";
import { parseGitRemote, projectIconSourceUrl } from "./shared/project-icon.js";

export const ICON_FRESH_MS = 7 * 24 * 60 * 60 * 1000;
export const ICON_RETRY_MS = 24 * 60 * 60 * 1000;
const ICON_FETCH_TIMEOUT_MS = 5000;
const ICON_MAX_BYTES = 256 * 1024;
export const LAYOUT_APPLIED_KEY = "layout-applied:v1";

const ICON_MIGRATIONS = [
  `CREATE TABLE project_icons (
    source_url TEXT PRIMARY KEY,
    content_type TEXT,
    data BLOB,
    fetched_at INTEGER NOT NULL
  )`,
];

interface IconRow {
  content_type: string | null;
  data: Buffer | null;
  fetched_at: number;
}

export type IconFetch = (url: string) => Promise<Response>;

export function createProjectIconStore(
  bb: BbPluginApi,
  fetchIcon: IconFetch,
  now: () => number = Date.now,
) {
  const db = () => {
    const handle = bb.storage.database();
    bb.storage.migrate(handle, ICON_MIGRATIONS);
    return handle;
  };
  const inFlight = new Map<string, Promise<void>>();

  function read(sourceUrl: string): IconRow | undefined {
    return db()
      .prepare(
        "SELECT content_type, data, fetched_at FROM project_icons WHERE source_url = ?",
      )
      .get(sourceUrl) as IconRow | undefined;
  }

  function write(
    sourceUrl: string,
    contentType: string | null,
    data: Buffer | null,
  ): void {
    db()
      .prepare(
        `INSERT INTO project_icons (source_url, content_type, data, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(source_url) DO UPDATE SET
           content_type = excluded.content_type,
           data = excluded.data,
           fetched_at = excluded.fetched_at`,
      )
      .run(sourceUrl, contentType, data, now());
  }

  async function download(sourceUrl: string): Promise<void> {
    try {
      const response = await fetchIcon(sourceUrl);
      const contentType = response.headers.get("content-type") ?? "";
      if (!response.ok || !contentType.startsWith("image/")) {
        write(sourceUrl, null, null);
        return;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0 || bytes.length > ICON_MAX_BYTES) {
        write(sourceUrl, null, null);
        return;
      }
      write(sourceUrl, contentType.split(";")[0]!.trim(), bytes);
    } catch (error) {
      bb.log.warn(
        `could not fetch project icon ${sourceUrl}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      write(sourceUrl, null, null);
    }
  }

  function refresh(sourceUrl: string): Promise<void> {
    const pending = inFlight.get(sourceUrl);
    if (pending !== undefined) return pending;
    const task = download(sourceUrl).finally(() => inFlight.delete(sourceUrl));
    inFlight.set(sourceUrl, task);
    return task;
  }

  function cachedDataUrl(sourceUrl: string): {
    dataUrl: string | null;
    stale: boolean;
  } {
    const row = read(sourceUrl);
    if (row === undefined) return { dataUrl: null, stale: true };
    const age = now() - row.fetched_at;
    if (row.data === null || row.content_type === null) {
      return { dataUrl: null, stale: age >= ICON_RETRY_MS };
    }
    return {
      dataUrl: `data:${row.content_type};base64,${row.data.toString("base64")}`,
      stale: age >= ICON_FRESH_MS,
    };
  }

  async function iconsFor(
    projects: readonly { id: string; gitRemoteUrl: string | null }[],
  ): Promise<{ icons: Record<string, string | null>; refreshing: Promise<void>[] }> {
    const icons: Record<string, string | null> = {};
    const refreshing: Promise<void>[] = [];
    const queued = new Set<string>();
    for (const project of projects) {
      const sourceUrl = projectIconSourceUrl(parseGitRemote(project.gitRemoteUrl));
      if (sourceUrl === null) {
        icons[project.id] = null;
        continue;
      }
      const cached = cachedDataUrl(sourceUrl);
      icons[project.id] = cached.dataUrl;
      if (cached.stale && !queued.has(sourceUrl)) {
        queued.add(sourceUrl);
        refreshing.push(refresh(sourceUrl));
      }
    }
    return { icons, refreshing };
  }

  return { iconsFor };
}

export function threadListProviderFor(
  pluginId: string,
  layout: SidebarLayout,
): string {
  return layout === "inbox"
    ? inboxThreadListProvider(pluginId)
    : CLASSIC_THREAD_LIST_PROVIDER;
}

export async function applySidebarLayout(
  bb: BbPluginApi,
  layout: SidebarLayout,
  options: { onlyWhenAutomatic: boolean },
): Promise<void> {
  const { preferences } = await bb.sdk.system.uiPreferences.list();
  const current = preferences[THREAD_LIST_PROVIDER_PREFERENCE];
  if (
    options.onlyWhenAutomatic &&
    current !== undefined &&
    current.value !== AUTOMATIC_THREAD_LIST_PROVIDER
  ) {
    return;
  }
  const value = threadListProviderFor(bb.pluginId, layout);
  if (current?.value === value) return;
  await bb.sdk.system.uiPreferences.set({
    key: THREAD_LIST_PROVIDER_PREFERENCE,
    expectedRevision: current?.revision ?? 0,
    value,
  });
}

export async function pendingInteractionKinds(
  bb: BbPluginApi,
  threadIds: readonly string[],
): Promise<Record<string, PendingInteractionKind>> {
  const kinds: Record<string, PendingInteractionKind> = {};
  await Promise.all(
    threadIds.map(async (threadId) => {
      try {
        const interactions = await bb.sdk.threads.interactions.list({ threadId });
        const pending = interactions.filter(
          (interaction) => interaction.status === "pending",
        );
        if (pending.length === 0) return;
        kinds[threadId] = pending.some(
          (interaction) => interaction.payload.kind === "approval",
        )
          ? "approval"
          : "input";
      } catch (error) {
        bb.log.warn(
          `could not read pending interactions for ${threadId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }),
  );
  return kinds;
}

export default async function inboxPlugin(
  bb: BbPluginApi,
  fetchIcon: IconFetch = (url) =>
    fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(ICON_FETCH_TIMEOUT_MS),
    }),
) {
  const settings = bb.settings.define({
    layout: {
      type: "select",
      label: "Sidebar layout",
      description:
        "Inbox puts threads that need you on top and folds working and done threads below. Classic is bb's thread list.",
      options: [...SIDEBAR_LAYOUTS],
      experimental_optionLabels: { inbox: "Inbox", classic: "Classic" },
      default: DEFAULT_SIDEBAR_LAYOUT,
    },
  });

  const iconStore = createProjectIconStore(bb, fetchIcon);

  bb.rpc.register(inboxRpcContract, {
    async projectIcons() {
      const projects = await bb.sdk.projects.list();
      const { icons, refreshing } = await iconStore.iconsFor(projects);
      if (refreshing.length > 0) {
        void Promise.all(refreshing).then(() => {
          bb.realtime.publish(PROJECT_ICONS_CHANGED_CHANNEL, null);
        });
      }
      return { icons };
    },
    async pendingInteractionKinds({ threadIds }) {
      return { kinds: await pendingInteractionKinds(bb, threadIds) };
    },
  });

  settings.onChange((next, previous) => {
    if (next.layout === previous.layout || !isSidebarLayout(next.layout)) return;
    void applySidebarLayout(bb, next.layout, { onlyWhenAutomatic: false }).catch(
      (error: unknown) => {
        bb.log.warn(
          `could not switch the sidebar layout to ${next.layout}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      },
    );
  });

  const { layout } = await settings.get();
  if (!isSidebarLayout(layout)) return;
  const applied = (await bb.storage.kv.get<boolean>(LAYOUT_APPLIED_KEY)) === true;
  try {
    await applySidebarLayout(bb, layout, { onlyWhenAutomatic: applied });
    if (!applied) await bb.storage.kv.set(LAYOUT_APPLIED_KEY, true);
  } catch (error) {
    bb.log.warn(
      `could not apply the sidebar layout: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
