// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { Panel, PanelGroup } from "react-resizable-panels";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { ThreadInfoFixedTabContent } from "@/components/secondary-panel/thread-info-registration";
import { createThreadInfoFixedPanelTab } from "@/lib/fixed-panel-tabs-state";
import { createQueryClientTestHarness } from "@/test/queryClientTestHarness";
import {
  PANEL_SLIDE_MS,
  PanelSlideContext,
  usePanelSlide,
} from "./panelTransitionTokens";
import { ThreadSecondaryPanel } from "./ThreadSecondaryPanel";

vi.mock(
  "react-resizable-panels",
  () => import("@/test/react-resizable-panels-stub"),
);

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
] as const;

function SlidingPanel({ open }: { open: boolean }) {
  const slide = usePanelSlide(open, true);
  return (
    <PanelSlideContext.Provider value={slide}>
      <ThreadSecondaryPanel
        activeTab={infoFixedTab}
        fixedTabs={infoFixedTabs}
        tabs={[]}
        isOpen={open}
        metadataContent={null}
        onClose={noop}
        onCollapse={noop}
        onTabReorder={noop}
        onOpenNewTab={noop}
        onPanelFocus={noop}
        renderAsDrawer={false}
        isConversationCollapsed={false}
        onToggleConversationCollapse={noop}
      />
    </PanelSlideContext.Provider>
  );
}

function renderSlidingPanel() {
  const { wrapper: Wrapper } = createQueryClientTestHarness();
  const content = (open: boolean) => (
    <Wrapper>
      <TooltipProvider>
        <PanelGroup direction="horizontal">
          <Panel id="main">
            <main />
          </Panel>
          <SlidingPanel open={open} />
        </PanelGroup>
      </TooltipProvider>
    </Wrapper>
  );
  const view = render(content(false));
  const surface = () => {
    const aside = document.querySelector("aside");
    if (aside === null) throw new Error("Expected the panel surface");
    return aside;
  };
  const slot = () => {
    const panel = surface().closest<HTMLElement>('[data-testid="panel"]');
    if (panel === null) throw new Error("Expected the panel layout slot");
    return panel;
  };
  const handle = () => {
    const element = document.querySelector(
      '[data-testid="panel-resize-handle"]',
    );
    if (element === null) throw new Error("Expected the resize handle");
    return element;
  };
  return {
    handle,
    setOpen: (open: boolean) => view.rerender(content(open)),
    slot,
    surface,
  };
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "requestAnimationFrame",
      "cancelAnimationFrame",
    ],
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("ThreadSecondaryPanel desktop slide", () => {
  it("slides the surface over the main pane on translate while its layout slot stays collapsed", () => {
    const { handle, setOpen, slot, surface } = renderSlidingPanel();
    expect(surface().classList.contains("translate-x-full")).toBe(true);

    setOpen(true);

    expect(surface().classList.contains("right-0")).toBe(true);
    expect(surface().classList.contains("left-auto")).toBe(true);
    expect(surface().classList.contains("translate-x-0")).toBe(true);
    expect(surface().className).toContain("[transition:translate_");
    expect(surface().className).not.toMatch(/transition:[^\]]*(width|left)/);
    expect(surface().style.width).toMatch(/cqw\)?$/);
    expect(slot().style.overflow).toBe("visible");
    expect(slot().className).not.toContain("transition-[flex-grow");
    expect(handle().classList.contains("w-0")).toBe(true);
    expect(handle().className).not.toMatch(/transition-\[[^\]]*width/);
  });

  it("returns the surface to the open slot without a transform once the slide ends", () => {
    const { setOpen, slot, surface } = renderSlidingPanel();
    setOpen(true);

    act(() => {
      vi.advanceTimersByTime(PANEL_SLIDE_MS);
    });

    expect(surface().classList.contains("left-0")).toBe(true);
    expect(surface().className).not.toMatch(/translate-x-|right-0/);
    expect(slot().style.overflow).toBe("clip");
  });

  it("holds the surface over the already-collapsed slot for two frames, then slides it off", () => {
    const { setOpen, slot, surface } = renderSlidingPanel();
    setOpen(true);
    act(() => {
      vi.advanceTimersByTime(PANEL_SLIDE_MS);
    });
    act(() => {
      vi.advanceTimersToNextFrame();
      vi.advanceTimersToNextFrame();
    });

    setOpen(false);

    expect(slot().style.overflow).toBe("visible");
    expect(surface().classList.contains("right-0")).toBe(true);
    expect(surface().classList.contains("translate-x-0")).toBe(true);
    expect(surface().className).not.toContain("[transition:translate_");
    expect(surface().hasAttribute("inert")).toBe(true);

    act(() => {
      vi.advanceTimersToNextFrame();
    });
    expect(surface().classList.contains("translate-x-0")).toBe(true);
    act(() => {
      vi.advanceTimersToNextFrame();
    });

    expect(slot().style.overflow).toBe("visible");
    expect(surface().classList.contains("translate-x-full")).toBe(true);
    expect(surface().className).toContain("[transition:translate_");

    act(() => {
      vi.advanceTimersByTime(PANEL_SLIDE_MS);
    });
    expect(slot().style.overflow).toBe("clip");
    expect(surface().className).not.toContain("[transition:translate_");
  });
});
