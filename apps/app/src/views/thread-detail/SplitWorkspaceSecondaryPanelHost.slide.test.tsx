// @vitest-environment jsdom

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { act, cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CompactViewportOverrideProvider } from "@bb/shared-ui/hooks/use-compact-viewport";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { LazyThreadSecondaryPanel } from "@/components/secondary-panel/lazySecondaryPanelComponents";
import { ThreadInfoFixedTabContent } from "@/components/secondary-panel/thread-info-registration";
import { PANEL_SLIDE_MS } from "@/components/secondary-panel/panelTransitionTokens";
import { createThreadInfoFixedPanelTab } from "@/lib/fixed-panel-tabs-state";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import {
  createPaneSecondaryPanelRegistry,
  PaneContext,
  type PaneContextValue,
  type PaneSecondaryPanelRegistration,
} from "./PaneContext";
import { SplitWorkspaceSecondaryPanelHost } from "./SplitWorkspaceSecondaryPanelHost";
import { ThreadDetailSecondaryContent } from "./ThreadDetailSecondaryContent";

vi.mock("react-resizable-panels", async () => {
  const { createRequire } = await import("node:module");
  const { dirname, join } = await import("node:path");
  const packageJsonPath = createRequire(import.meta.url).resolve(
    "react-resizable-panels/package.json",
  );
  return import(
    /* @vite-ignore */ join(
      dirname(packageJsonPath),
      "dist/react-resizable-panels.browser.development.esm.js",
    )
  );
});

vi.mock("@/lib/bb-desktop", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bb-desktop")>()),
  getBbDesktopInfo: () => null,
  shouldReserveMacosTrafficLights: () => false,
  shouldUseMacosDesktopChrome: () => false,
}));

vi.mock("@/components/ui/sidebar.js", () => ({
  useOptionalIsSidebarShowing: () => true,
  useSidebarKeepsCollapsedRail: () => false,
  useIsSidebarFramed: () => false,
}));

vi.mock("@/hooks/queries/thread-queries", () => ({
  useThreads: () => ({ data: [] }),
}));

type ThreadDetailSecondaryContentProps = ComponentProps<
  typeof ThreadDetailSecondaryContent
>;

const PANE_ID = "pane-1";
const PANEL_CONTENT_TEXT = "No thread details available.";
const noop = () => {};
const infoFixedTab = createThreadInfoFixedPanelTab();
const infoFixedTabs = [
  {
    ariaLabel: "Show thread info panel",
    label: "Info",
    contentFillsRegion: true,
    renderContent: () => <ThreadInfoFixedTabContent />,
    leadingVisual: null,
    onSelect: noop,
    tab: infoFixedTab,
    title: "Thread info",
  },
];

function createMetadata(): ThreadDetailSecondaryContentProps["metadata"] {
  return {
    canAssignToParent: false,
    canTakeOverThread: false,
    environment: null,
    environmentProvisioningFailure: false,
    threadEnvironmentState: null,
    environmentDisplayHost: { locality: "local", identity: null },
    isLoadingMergeBaseBranchOptions: false,
    mergeBaseBranchOptions: undefined,
    onAssignParent: noop,
    onParentSelectorOpenChange: noop,
    onRetryParentThreads: noop,
    onMergeBaseBranchChange: noop,
    parentThreadProjectId: null,
    parentThreadDisplayName: null,
    parentThreads: [],
    isLoadingParentThreads: false,
    isParentThreadsError: false,
    projectId: "proj-test",
    threadEnvironmentId: null,
    selectedMergeBaseBranch: undefined,
    thread: {
      archivedAt: null,
      createdAt: 0,
      deletedAt: null,
      environmentId: null,
      id: "thread-1",
      lastReadAt: null,
      latestAttentionAt: 0,
      parentThreadId: null,
      pinnedAt: null,
      projectId: "proj-test",
      providerId: "codex",
      lifecycleOwnerThreadId: null,
      sourceThreadId: null,
      originKind: null,
      originPluginId: null,
      visibility: "visible",
      parentNotifications: "auto",
      status: "idle",
      stopRequestedAt: null,
      title: null,
      titleFallback: "Test thread",
      sectionId: null,
      updatedAt: 0,
    },
    threadSchedules: [],
    updateThreadPending: false,
    workspaceStatus: undefined,
    workspaceStatusError: null,
  } as ThreadDetailSecondaryContentProps["metadata"];
}

const threadPanelToggle = { current: noop };

function ThreadPane({
  registration,
}: {
  registration: PaneSecondaryPanelRegistration | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((current) => !current), []);
  useLayoutEffect(() => {
    threadPanelToggle.current = toggle;
  }, [toggle]);
  const metadata = useMemo(() => createMetadata(), []);
  const paneContext = useMemo<PaneContextValue>(
    () => ({
      paneId: PANE_ID,
      isFocused: true,
      isSplitPane: false,
      secondaryPanelHost: registration,
      reservesWindowPanelToggle: false,
      onRequestClose: null,
      isMaximized: false,
      onToggleMaximize: null,
      isBoundedPane: false,
      isTopRow: true,
      ownsWindowTopLeft: true,
      navigateInPane: noop,
    }),
    [registration],
  );
  return (
    <PaneContext.Provider value={paneContext}>
      <ThreadDetailSecondaryContent
        header={<div data-testid="header" />}
        isBoundedPane={false}
        isConversationCollapsed={false}
        isMetadataLoading={false}
        isSecondaryPanelOpen={isOpen}
        main={<div data-testid="timeline" />}
        metadata={metadata}
        onToggleConversationCollapse={noop}
        onToggleSecondaryPanel={toggle}
        renderHostedPanel={(panel) => panel}
        secondaryPanel={{
          activeTab: infoFixedTab,
          tabs: [],
          fixedTabs: infoFixedTabs,
          isOpen,
          onCollapse: () => setIsOpen(false),
          onClose: () => setIsOpen(false),
          onTabReorder: noop,
          onOpenNewTab: noop,
          onPanelFocus: noop,
          renderBrowserDeck: () => null,
        }}
      />
    </PaneContext.Provider>
  );
}

function SplitWorkspace({ hostsThreadPanel }: { hostsThreadPanel: boolean }) {
  const [registry] = useState(createPaneSecondaryPanelRegistry);
  const registration = useMemo<PaneSecondaryPanelRegistration>(
    () => ({
      clear: () => registry.clear(PANE_ID),
      publish: (model) => registry.publish(PANE_ID, model),
    }),
    [registry],
  );
  return (
    <SplitWorkspaceSecondaryPanelHost
      focusedPaneId={PANE_ID}
      isPaneMaximized={false}
      registry={registry}
    >
      {hostsThreadPanel ? (
        <ThreadPane registration={registration} />
      ) : (
        <div data-testid="pane-without-panel" />
      )}
    </SplitWorkspaceSecondaryPanelHost>
  );
}

function clickWindowPanelToggle() {
  const button = document.querySelector<HTMLButtonElement>(
    '[data-testid="split-workspace-panel-toggle"] button',
  );
  if (button === null) throw new Error("Expected the window panel toggle");
  button.click();
}

interface PanelHostCase {
  name: string;
  tree: () => ReactNode;
  toggle: () => void;
  mainPanelId: string;
  surfaceSelector: string;
  contentText: string;
}

const THREAD_SURFACE_SELECTOR =
  'aside, [data-testid="thread-secondary-panel-placeholder"] > div';

const PANEL_HOST_CASES: PanelHostCase[] = [
  {
    name: "thread view (SplitWorkspaceSecondaryPanelHost hosting the thread panel)",
    tree: () => <SplitWorkspace hostsThreadPanel />,
    toggle: () => threadPanelToggle.current(),
    mainPanelId: "split-workspace-main-panel",
    surfaceSelector: THREAD_SURFACE_SELECTOR,
    contentText: PANEL_CONTENT_TEXT,
  },
  {
    name: "split workspace pane without a panel (SplitWorkspaceSecondaryPanelHost empty state)",
    tree: () => <SplitWorkspace hostsThreadPanel={false} />,
    toggle: clickWindowPanelToggle,
    mainPanelId: "split-workspace-main-panel",
    surfaceSelector: '[data-testid="split-workspace-empty-panel-state"]',
    contentText: "This pane has no right panel.",
  },
  {
    name: "unhosted pane (SecondaryPanelLayout)",
    tree: () => <ThreadPane registration={null} />,
    toggle: () => threadPanelToggle.current(),
    mainPanelId: "thread-detail-timeline-panel",
    surfaceSelector: THREAD_SURFACE_SELECTOR,
    contentText: PANEL_CONTENT_TEXT,
  },
];

function transitionsFlexGrow(element: HTMLElement): boolean {
  const tokens = [...element.classList].filter((token) => !token.includes(":"));
  if (tokens.includes("transition-none")) return false;
  const propertyTokens = tokens.filter(
    (token) =>
      token === "transition" ||
      token.startsWith("transition-") ||
      token.startsWith("[transition:"),
  );
  if (propertyTokens.length === 0) {
    return tokens.some((token) => token.startsWith("duration-"));
  }
  return propertyTokens.some(
    (token) =>
      token === "transition" ||
      token === "transition-all" ||
      /flex-grow|(^|[_,[])all[_,\]]/.test(token),
  );
}

interface FrameSample {
  frame: number;
  mainFlexGrow: string;
  mainTransitionsFlexGrow: boolean;
  slotFlexGrow: string;
  slotTransitionsFlexGrow: boolean;
  surfacePresent: boolean;
  surfaceHasContent: boolean;
  surfaceOverlaying: boolean;
  surfaceTranslate: "off-canvas" | "in-place" | "none";
  surfaceTransitionsTranslate: boolean;
}

function renderPanelHost(host: PanelHostCase) {
  const { wrapper: QueryWrapper } = createQueryClientTestHarness();
  render(
    <QueryWrapper>
      <TooltipProvider>
        <MemoryRouter>
          <CompactViewportOverrideProvider isCompactViewport={false}>
            {host.tree()}
          </CompactViewportOverrideProvider>
        </MemoryRouter>
      </TooltipProvider>
    </QueryWrapper>,
  );
  const panelById = (id: string) => {
    const element = document.querySelector<HTMLElement>(
      `[data-panel-id="${id}"]`,
    );
    if (element === null) throw new Error(`Expected the panel ${id}`);
    return element;
  };
  let frame = 0;
  const sample = (): FrameSample => {
    const mainPane = panelById(host.mainPanelId);
    const panelSlot = mainPane.parentElement?.querySelector<HTMLElement>(
      `:scope > [data-panel]:not([data-panel-id="${host.mainPanelId}"])`,
    );
    if (panelSlot == null) throw new Error("Expected the right panel slot");
    const surface = panelSlot.querySelector<HTMLElement>(host.surfaceSelector);
    return {
      frame,
      mainFlexGrow: mainPane.style.flexGrow,
      mainTransitionsFlexGrow: transitionsFlexGrow(mainPane),
      slotFlexGrow: panelSlot.style.flexGrow,
      slotTransitionsFlexGrow: transitionsFlexGrow(panelSlot),
      surfacePresent: surface !== null,
      surfaceHasContent:
        surface?.textContent?.includes(host.contentText) === true,
      surfaceOverlaying: surface?.classList.contains("right-0") === true,
      surfaceTranslate: surface?.classList.contains("translate-x-full")
        ? "off-canvas"
        : surface?.classList.contains("translate-x-0")
          ? "in-place"
          : "none",
      surfaceTransitionsTranslate:
        surface?.className.includes("[transition:translate_") === true,
    };
  };
  const runFrames = (count: number): FrameSample[] => {
    const samples: FrameSample[] = [];
    for (let index = 0; index < count; index += 1) {
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      frame += 1;
      samples.push(sample());
    }
    return samples;
  };
  const toggle = (): FrameSample[] => {
    act(() => {
      host.toggle();
    });
    return runFrames(1);
  };
  runFrames(3);
  frame = 0;
  return { runFrames, sample, toggle };
}

function layoutChanges(samples: readonly FrameSample[]): FrameSample[] {
  return samples.filter(
    (current, index) =>
      index > 0 && current.mainFlexGrow !== samples[index - 1]?.mainFlexGrow,
  );
}

const SETTLE_FRAMES = Math.ceil(PANEL_SLIDE_MS / 16) + 6;

beforeAll(async () => {
  await LazyThreadSecondaryPanel.preload();
});

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
      "performance",
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  threadPanelToggle.current = noop;
});

describe.each(PANEL_HOST_CASES)("right panel slide in the $name", (host) => {
  it("slides the real panel content over the full-width pane, then narrows the pane once without animating it", () => {
    const view = renderPanelHost(host);
    const closed = view.sample();
    expect(closed.mainFlexGrow).toBe("100");

    const samples = [
      closed,
      ...view.toggle(),
      ...view.runFrames(SETTLE_FRAMES),
    ];

    const changes = layoutChanges(samples);
    expect(changes).toHaveLength(1);
    const [narrowed] = changes;
    expect(Number(narrowed?.mainFlexGrow)).toBeLessThan(100);
    expect(narrowed?.mainTransitionsFlexGrow).toBe(false);
    expect(narrowed?.slotTransitionsFlexGrow).toBe(false);
    expect(narrowed?.surfaceOverlaying).toBe(false);

    const sliding = samples.filter(
      (current) => current.frame > 0 && current.mainFlexGrow === "100",
    );
    expect(sliding.length).toBeGreaterThanOrEqual(
      Math.floor(PANEL_SLIDE_MS / 16) - 1,
    );
    for (const current of sliding) {
      expect(current).toMatchObject({
        surfacePresent: true,
        surfaceHasContent: true,
        surfaceOverlaying: true,
        mainTransitionsFlexGrow: false,
      });
    }

    const afterNarrowing = samples.slice(samples.indexOf(narrowed!));
    for (const current of afterNarrowing) {
      expect(current.mainFlexGrow).toBe(narrowed?.mainFlexGrow);
      expect(current.surfaceHasContent).toBe(true);
    }
  });

  it("widens the pane once underneath the panel when closing, then slides the panel off", () => {
    const view = renderPanelHost(host);
    view.toggle();
    view.runFrames(SETTLE_FRAMES);
    const open = view.sample();
    expect(Number(open.mainFlexGrow)).toBeLessThan(100);

    const closing = view.toggle();
    expect(closing[0]).toMatchObject({
      mainFlexGrow: "100",
      mainTransitionsFlexGrow: false,
      slotTransitionsFlexGrow: false,
      surfaceHasContent: true,
      surfaceOverlaying: true,
    });

    const samples = [open, ...closing, ...view.runFrames(SETTLE_FRAMES)];
    expect(layoutChanges(samples)).toEqual([closing[0]]);
    const afterClose = samples.slice(1);
    const slideStart = afterClose.findIndex(
      (current) => current.surfaceTransitionsTranslate,
    );
    const held = afterClose.slice(0, slideStart);
    expect(held.length).toBeGreaterThanOrEqual(1);
    for (const current of held) {
      expect(current).toMatchObject({
        mainFlexGrow: "100",
        surfaceHasContent: true,
        surfaceOverlaying: true,
        surfaceTranslate: "in-place",
        surfaceTransitionsTranslate: false,
      });
    }
    const slidingOff = afterClose
      .slice(slideStart)
      .filter((current) => current.surfaceTransitionsTranslate);
    expect(slidingOff.length).toBeGreaterThanOrEqual(
      Math.floor(PANEL_SLIDE_MS / 16) - 1,
    );
    for (const current of slidingOff) {
      expect(current).toMatchObject({
        mainFlexGrow: "100",
        surfaceHasContent: true,
        surfaceOverlaying: true,
        surfaceTranslate: "off-canvas",
      });
    }
    const settled = afterClose.at(-1);
    expect(settled).toMatchObject({
      mainFlexGrow: "100",
      surfaceTranslate: "off-canvas",
      surfaceTransitionsTranslate: false,
    });
  });

  it("never resizes the pane when an open is interrupted by a close", () => {
    const view = renderPanelHost(host);
    const closed = view.sample();

    const samples = [
      closed,
      ...view.toggle(),
      ...view.runFrames(5),
      ...view.toggle(),
      ...view.runFrames(SETTLE_FRAMES),
    ];

    expect(layoutChanges(samples)).toEqual([]);
    expect(samples.every((current) => current.mainFlexGrow === "100")).toBe(
      true,
    );
  });

  it("widens once on a close and narrows once after a reopen interrupts it", () => {
    const view = renderPanelHost(host);
    view.toggle();
    view.runFrames(SETTLE_FRAMES);
    const open = view.sample();

    const samples = [
      open,
      ...view.toggle(),
      ...view.runFrames(5),
      ...view.toggle(),
      ...view.runFrames(SETTLE_FRAMES),
    ];

    const changes = layoutChanges(samples);
    expect(changes.map((current) => current.mainFlexGrow)).toEqual([
      "100",
      open.mainFlexGrow,
    ]);
    for (const change of changes) {
      expect(change.mainTransitionsFlexGrow).toBe(false);
      expect(change.slotTransitionsFlexGrow).toBe(false);
    }
    expect(samples.every((current) => current.surfaceHasContent)).toBe(true);
  });
});
