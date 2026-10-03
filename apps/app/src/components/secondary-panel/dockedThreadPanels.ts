import { atomWithStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";
import { z } from "zod";
import {
  createPluginPanelFixedPanelTab,
  type PluginPanelFixedPanelTab,
} from "@/lib/fixed-panel-tabs-state";
import type { ExperimentalDockedThreadPanel } from "@get-bb/plugin-sdk";
import { createLocalStorageSyncStorage } from "@/lib/browser-storage";
import { serializePluginPanelParams } from "@/lib/plugin-json-value";

export interface DockedThreadPanel {
  pluginId: string;
  actionId: string;
  title: string;
  paramsJson: string | null;
}

const dockedThreadPanelSchema = z.object({
  pluginId: z.string().min(1),
  actionId: z.string().min(1),
  title: z.string(),
  paramsJson: z.string().nullable(),
});
const dockedThreadPanelsSchema = z.array(dockedThreadPanelSchema);
const dockedPanelWidthsSchema = z.record(z.string(), z.number().gt(0).lte(100));

export const DEFAULT_DOCKED_PANEL_WIDTH_PERCENT = 30;
const EMPTY_DOCKED_THREAD_PANELS: readonly DockedThreadPanel[] = [];

function parseStoredJson<T>(
  schema: z.ZodType<T>,
  storedValue: string | null,
  initialValue: T,
): T {
  if (storedValue === null) return initialValue;
  try {
    const parsed = schema.safeParse(JSON.parse(storedValue));
    return parsed.success ? parsed.data : initialValue;
  } catch {
    return initialValue;
  }
}

const dockedThreadPanelsStorage = createLocalStorageSyncStorage<
  readonly DockedThreadPanel[]
>({
  parse: (storedValue, initialValue) =>
    parseStoredJson(dockedThreadPanelsSchema, storedValue, initialValue),
  serialize: (value) => JSON.stringify(value),
});

const dockedThreadPanelsAtomFamily = atomFamily((threadId: string) =>
  atomWithStorage<readonly DockedThreadPanel[]>(
    `bb.thread.dockedPanels.v2-${encodeURIComponent(threadId)}`,
    EMPTY_DOCKED_THREAD_PANELS,
    dockedThreadPanelsStorage,
    { getOnInit: true },
  ),
);

export function getDockedThreadPanelsAtom(threadId: string) {
  return dockedThreadPanelsAtomFamily(threadId);
}

const dockedPanelWidthsStorage = createLocalStorageSyncStorage<
  Readonly<Record<string, number>>
>({
  parse: (storedValue, initialValue) =>
    parseStoredJson(dockedPanelWidthsSchema, storedValue, initialValue),
  serialize: (value) => JSON.stringify(value),
});

export const dockedPanelWidthPercentsAtom = atomWithStorage<
  Readonly<Record<string, number>>
>("bb.thread.dockedPanels.widthPercents", {}, dockedPanelWidthsStorage, {
  getOnInit: true,
});

export function dockedPanelWidthKey(panel: DockedThreadPanel): string {
  return `${panel.pluginId}:${panel.actionId}`;
}

export function dockedThreadPanelTab(
  panel: DockedThreadPanel,
): PluginPanelFixedPanelTab {
  return createPluginPanelFixedPanelTab(panel);
}

export function dockThreadPanels(
  panels: readonly DockedThreadPanel[],
  additions: readonly DockedThreadPanel[],
): readonly DockedThreadPanel[] {
  let next = panels;
  for (const addition of additions) {
    const id = dockedThreadPanelTab(addition).id;
    const index = next.findIndex(
      (panel) => dockedThreadPanelTab(panel).id === id,
    );
    next =
      index === -1
        ? [...next, addition]
        : next.map((panel, i) => (i === index ? addition : panel));
  }
  return next;
}

export function undockThreadPanel(
  panels: readonly DockedThreadPanel[],
  tabId: string,
): readonly DockedThreadPanel[] {
  return panels.filter((panel) => dockedThreadPanelTab(panel).id !== tabId);
}

export function resolveDockedThreadPanelRequests({
  requests,
  callerPluginId,
  actions,
}: {
  requests: readonly ExperimentalDockedThreadPanel[];
  callerPluginId: string;
  actions: readonly { pluginId: string; id: string; title: string }[];
}): readonly DockedThreadPanel[] {
  return requests.flatMap((request) => {
    const pluginId = request.pluginId ?? callerPluginId;
    let paramsJson: string | null;
    try {
      paramsJson = serializePluginPanelParams(request.params);
    } catch (error) {
      console.warn(
        `[plugin:${callerPluginId}] toThread docked panel ${pluginId}/${request.actionId} skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return [];
    }
    const action = actions.find(
      (candidate) =>
        candidate.pluginId === pluginId && candidate.id === request.actionId,
    );
    return [
      {
        pluginId,
        actionId: request.actionId,
        title: request.title ?? action?.title ?? request.actionId,
        paramsJson,
      },
    ];
  });
}
