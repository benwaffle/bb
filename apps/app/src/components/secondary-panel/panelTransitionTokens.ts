import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type Key,
} from "react";
import { usePrefersReducedMotion } from "@bb/shared-ui/hooks/use-media-query";

type PanelCollapseTransitionStyle = CSSProperties & {
  "--panel-collapse-duration": string;
};

export const PANEL_COLLAPSE_TRANSITION_CLASS =
  "duration-[var(--panel-collapse-duration,220ms)] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

export function getPanelCollapseTransitionStyle(
  transitionsReady: boolean,
): PanelCollapseTransitionStyle {
  return {
    "--panel-collapse-duration": transitionsReady ? "220ms" : "0ms",
  };
}

export function usePanelCollapseTransitionsReady(
  resetKey: Key,
  enabled: boolean,
): boolean {
  const [readyKey, setReadyKey] = useState<Key | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let secondFrame: number | null = null;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setReadyKey(resetKey);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
    };
  }, [enabled, resetKey]);

  return !enabled || readyKey === resetKey;
}

const PANEL_LAYOUT_TRANSITION_CLASS = `transition-[flex-grow,flex-basis] ${PANEL_COLLAPSE_TRANSITION_CLASS}`;

export function getPanelLayoutTransitionClassName(
  animatesLayout: boolean,
): string {
  return animatesLayout ? PANEL_LAYOUT_TRANSITION_CLASS : "transition-none";
}

export const PANEL_RESIZE_HANDLE_LAYER_CLASS = "z-[25]";

export const PANEL_RESIZE_HIT_TARGET_CLASS =
  "absolute inset-y-0 left-1/2 z-10 w-4 -translate-x-1/2 touch-none cursor-col-resize pointer-coarse:w-8 bg-transparent";

export const PANEL_SLIDE_MS = 220;

export type PanelSlidePhase =
  | "closed"
  | "opening"
  | "settling"
  | "open"
  | "uncovering"
  | "closing";

export interface PanelSlide {
  phase: PanelSlidePhase;
  isLayoutOpen: boolean;
  isSliding: boolean;
  animatesLayout: boolean;
}

function toPanelSlide(phase: PanelSlidePhase): PanelSlide {
  return {
    phase,
    isLayoutOpen: phase === "open" || phase === "settling",
    isSliding:
      phase === "opening" || phase === "uncovering" || phase === "closing",
    animatesLayout: phase === "open",
  };
}

const OPEN_PANEL_SLIDE = toPanelSlide("open");
const CLOSED_PANEL_SLIDE = toPanelSlide("closed");
const SLIDE_PHASES: Record<PanelSlidePhase, PanelSlide> = {
  closed: CLOSED_PANEL_SLIDE,
  opening: toPanelSlide("opening"),
  settling: toPanelSlide("settling"),
  open: OPEN_PANEL_SLIDE,
  uncovering: toPanelSlide("uncovering"),
  closing: toPanelSlide("closing"),
};

export function usePanelSlide(open: boolean, enabled: boolean): PanelSlide {
  const prefersReducedMotion = usePrefersReducedMotion();
  const animates = enabled && !prefersReducedMotion;
  const [state, setState] = useState<{
    open: boolean;
    phase: PanelSlidePhase;
  }>(() => ({ open, phase: open ? "open" : "closed" }));
  let phase = state.phase;
  if (state.open !== open) {
    phase = !animates
      ? open
        ? "open"
        : "closed"
      : open
        ? state.phase === "uncovering"
          ? "settling"
          : "opening"
        : state.phase === "open" || state.phase === "settling"
          ? "uncovering"
          : "closing";
    setState({ open, phase });
  }

  useEffect(() => {
    if (phase === "opening" || phase === "closing") {
      const nextPhase = phase === "opening" ? "settling" : "closed";
      const timeout = window.setTimeout(() => {
        setState((current) =>
          current.phase === phase ? { ...current, phase: nextPhase } : current,
        );
      }, PANEL_SLIDE_MS);
      return () => window.clearTimeout(timeout);
    }
    if (phase === "settling" || phase === "uncovering") {
      const nextPhase = phase === "settling" ? "open" : "closing";
      let secondFrame: number | null = null;
      const firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setState((current) =>
            current.phase === phase
              ? { ...current, phase: nextPhase }
              : current,
          );
        });
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (secondFrame !== null) window.cancelAnimationFrame(secondFrame);
      };
    }
    return undefined;
  }, [phase]);

  if (!animates) {
    return open ? OPEN_PANEL_SLIDE : CLOSED_PANEL_SLIDE;
  }
  return SLIDE_PHASES[phase];
}

export const PanelSlideContext = createContext<PanelSlide | null>(null);

export function usePanelSlideContext(): PanelSlide | null {
  return useContext(PanelSlideContext);
}

export const PANEL_SLIDE_PANEL_STYLE: CSSProperties = {
  overflow: "visible",
  pointerEvents: "auto",
  zIndex: 24,
};

const PANEL_SLIDE_TRANSITION_CLASS =
  "[transition:translate_var(--panel-collapse-duration,220ms)_cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

export function getPanelSlideSurfaceClassName(
  slide: PanelSlide | null,
): string | null {
  if (slide === null || slide.isLayoutOpen) {
    return null;
  }
  switch (slide.phase) {
    case "opening":
      return `left-auto right-0 translate-x-0 starting:translate-x-full ${PANEL_SLIDE_TRANSITION_CLASS}`;
    case "uncovering":
      return "left-auto right-0 translate-x-0";
    case "closing":
      return `left-auto right-0 translate-x-full ${PANEL_SLIDE_TRANSITION_CLASS}`;
    default:
      return "left-auto right-0 translate-x-full";
  }
}
