import {
  createContext,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { flushSync } from "react-dom";
import { isIOSWebKit } from "@/lib/ios-webkit";
import type { ScrollPositionKeeper } from "@/components/ui/scroll-position-keeper";

export const DEFAULT_WINDOWING_MIN_ITEM_COUNT = 20;
const MAX_MEASUREMENTS = 2_000;
const INITIAL_OVERSCAN_ITEMS = 2;
const TRAILING_OVERSCAN_VIEWPORTS = 1;
const MAX_LEADING_OVERSCAN_VIEWPORTS = 1.5;
const OVERSCAN_LOOKAHEAD_MS = 250;
const MAX_VELOCITY_SAMPLE_GAP_MS = 120;
const RETAINED_OVERSCAN_MULTIPLE = 3;
const TOP_MOUNT_VIEWPORTS = 2;
const MAX_INTERACTION_PINS = 24;
const MAX_WINDOW_UPDATES_PER_FRAME = 8;

export function recordTimelineMeasurement(
  measurements: Map<string, number>,
  key: string,
  height: number,
): void {
  measurements.delete(key);
  measurements.set(key, height);
  while (measurements.size > MAX_MEASUREMENTS) {
    const oldestKey = measurements.keys().next().value;
    if (oldestKey === undefined) break;
    measurements.delete(oldestKey);
  }
}

export interface TimelineWindowingScrollRoot {
  getScrollElement: () => HTMLElement | null;
  positionKeeper: ScrollPositionKeeper;
}

export const TimelineWindowingScrollRootContext =
  createContext<TimelineWindowingScrollRoot | null>(null);

export const TimelineWindowingMeasurementsContext = createContext<Map<
  string,
  number
> | null>(null);

export interface TimelineWindowedItemRenderState {
  itemRef: (node: HTMLDivElement | null) => (() => void) | undefined;
  windowingEnabled: boolean;
}

export interface TimelineWindowAnchor {
  key: string;
  offset: number;
}

export interface TimelineWindowedItemsProps {
  alwaysMountedKeys?: ReadonlySet<string>;
  estimateItemHeight: (index: number) => number;
  gap: number;
  initialWindowAnchor?: TimelineWindowAnchor | null;
  itemKeys: readonly string[];
  measurements: Map<string, number>;
  positionKeeper: ScrollPositionKeeper | null;
  renderItem: (
    index: number,
    state: TimelineWindowedItemRenderState,
  ) => ReactNode;
  pinnedToEnd: boolean;
}

interface LayoutModel {
  heights: number[];
  offsets: number[];
  total: number;
}

interface IndexRange {
  start: number;
  end: number;
}

interface WindowState {
  keys: ReadonlySet<string>;
  heights: ReadonlyMap<string, number>;
}

interface Overscan {
  before: number;
  after: number;
}

interface ScrollMotionSample {
  localTop: number;
  time: number;
  velocity: number;
}

const EMPTY_KEY_SET: ReadonlySet<string> = new Set();
const WINDOW_KEY_ATTRIBUTE = "data-timeline-window-key";

function buildModel(
  itemKeys: readonly string[],
  heights: ReadonlyMap<string, number>,
  estimateItemHeight: (index: number) => number,
  gap: number,
): LayoutModel {
  const itemHeights = new Array<number>(itemKeys.length);
  const offsets = new Array<number>(itemKeys.length);
  let top = 0;
  for (let index = 0; index < itemKeys.length; index += 1) {
    const key = itemKeys[index];
    const height =
      (key === undefined ? undefined : heights.get(key)) ??
      Math.max(1, estimateItemHeight(index));
    itemHeights[index] = height;
    offsets[index] = top;
    top += height + gap;
  }
  return {
    heights: itemHeights,
    offsets,
    total: itemKeys.length === 0 ? 0 : top - gap,
  };
}

function indexAtOffset(model: LayoutModel, offset: number): number {
  let low = 0;
  let high = model.offsets.length - 1;
  let found = 0;
  while (low <= high) {
    const index = low + Math.floor((high - low) / 2);
    if ((model.offsets[index] ?? 0) <= offset) {
      found = index;
      low = index + 1;
    } else {
      high = index - 1;
    }
  }
  return found;
}

function visibleRange(
  model: LayoutModel,
  localTop: number,
  viewportHeight: number,
): IndexRange {
  const count = model.offsets.length;
  if (count === 0) return { start: 0, end: -1 };
  const start = indexAtOffset(model, Math.max(0, localTop));
  const end = indexAtOffset(model, Math.max(0, localTop + viewportHeight));
  return { start, end: Math.min(count - 1, Math.max(start, end)) };
}

function reachesListTop(
  model: LayoutModel,
  visible: IndexRange,
  viewportHeight: number,
): boolean {
  return (
    (model.offsets[visible.start] ?? 0) < TOP_MOUNT_VIEWPORTS * viewportHeight
  );
}

function keysInRange(
  itemKeys: readonly string[],
  start: number,
  end: number,
): Set<string> {
  const keys = new Set<string>();
  for (let index = start; index <= end; index += 1) {
    const key = itemKeys[index];
    if (key !== undefined) keys.add(key);
  }
  return keys;
}

function initialWindowKeys(
  itemKeys: readonly string[],
  visible: IndexRange,
  mountToTop: boolean,
): Set<string> {
  return keysInRange(
    itemKeys,
    mountToTop ? 0 : Math.max(0, visible.start - INITIAL_OVERSCAN_ITEMS),
    Math.min(itemKeys.length - 1, visible.end + INITIAL_OVERSCAN_ITEMS),
  );
}

function overscanFor(viewportHeight: number, velocity: number): Overscan {
  const trailing = TRAILING_OVERSCAN_VIEWPORTS * viewportHeight;
  const leading = Math.min(
    MAX_LEADING_OVERSCAN_VIEWPORTS * viewportHeight,
    Math.max(trailing, Math.abs(velocity) * OVERSCAN_LOOKAHEAD_MS),
  );
  return velocity < 0
    ? { before: leading, after: trailing }
    : velocity > 0
      ? { before: trailing, after: leading }
      : { before: trailing, after: trailing };
}

function windowKeysAround(
  itemKeys: readonly string[],
  model: LayoutModel,
  localTop: number,
  viewportHeight: number,
  overscan: Overscan,
  mountToTop: boolean,
): Set<string> {
  const start = mountToTop
    ? 0
    : indexAtOffset(model, Math.max(0, localTop - overscan.before));
  const end = indexAtOffset(
    model,
    Math.max(0, localTop + viewportHeight + overscan.after),
  );
  return keysInRange(itemKeys, start, Math.min(itemKeys.length - 1, end));
}

function heldKeyOf(positionKeeper: ScrollPositionKeeper): string | null {
  const position = positionKeeper.getPosition();
  return position.kind === "anchor"
    ? position.key
    : positionKeeper.pendingRestoreRowId();
}

function sameKeys(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

function knownHeights(
  itemKeys: readonly string[],
  measurements: ReadonlyMap<string, number>,
  rendered: ReadonlyMap<string, number>,
): Map<string, number> {
  const heights = new Map<string, number>();
  for (const key of itemKeys) {
    const height = measurements.get(key) ?? rendered.get(key);
    if (height !== undefined) heights.set(key, height);
  }
  return heights;
}

function spacerHeight(model: LayoutModel, first: number, last: number) {
  const top = model.offsets[first] ?? 0;
  const bottom = (model.offsets[last] ?? 0) + (model.heights[last] ?? 0);
  return Math.max(0, bottom - top);
}

function findOwnedWindowKey(
  target: EventTarget | null,
  container: HTMLElement,
  indexByKey: ReadonlyMap<string, number>,
): string | null {
  let element = target instanceof Element ? target : null;
  while (element !== null && element !== container) {
    const key = element.getAttribute(WINDOW_KEY_ATTRIBUTE);
    if (key !== null && indexByKey.has(key)) return key;
    element = element.parentElement;
  }
  return null;
}

export function TimelineWindowedItems({
  alwaysMountedKeys = EMPTY_KEY_SET,
  estimateItemHeight,
  gap,
  initialWindowAnchor = null,
  itemKeys,
  measurements,
  positionKeeper,
  renderItem,
  pinnedToEnd,
}: TimelineWindowedItemsProps) {
  const [windowingSupported] = useState(
    () => typeof navigator === "undefined" || !isIOSWebKit(navigator),
  );
  const [scrollRootUsable, setScrollRootUsable] = useState<boolean | null>(
    null,
  );
  const windowingEnabled =
    windowingSupported &&
    positionKeeper !== null &&
    scrollRootUsable !== false &&
    itemKeys.length >= DEFAULT_WINDOWING_MIN_ITEM_COUNT;
  const containerRef = useRef<HTMLDivElement>(null);
  const [windowState, setWindowState] = useState<WindowState>(() => {
    const heights = new Map(measurements);
    if (itemKeys.length < DEFAULT_WINDOWING_MIN_ITEM_COUNT) {
      return { keys: new Set(itemKeys), heights };
    }
    const model = buildModel(itemKeys, heights, estimateItemHeight, gap);
    const viewportHeight =
      positionKeeper?.getViewportHeight() || window.innerHeight;
    const anchorIndex =
      initialWindowAnchor === null
        ? -1
        : itemKeys.indexOf(initialWindowAnchor.key);
    const localTop =
      anchorIndex >= 0 && initialWindowAnchor !== null
        ? (model.offsets[anchorIndex] ?? 0) - initialWindowAnchor.offset
        : pinnedToEnd
          ? model.total - viewportHeight
          : 0;
    const visible = visibleRange(model, localTop, viewportHeight);
    return {
      keys: initialWindowKeys(
        itemKeys,
        visible,
        reachesListTop(model, visible, viewportHeight),
      ),
      heights,
    };
  });
  const [interactionPins, setInteractionPins] = useState<readonly string[]>([]);

  const indexByKey = useMemo(
    () => new Map(itemKeys.map((key, index) => [key, index])),
    [itemKeys],
  );
  const renderModel = useMemo(
    () => buildModel(itemKeys, windowState.heights, estimateItemHeight, gap),
    [estimateItemHeight, gap, itemKeys, windowState.heights],
  );
  const mountedIndexes = useMemo(() => {
    if (!windowingEnabled) return itemKeys.map((_, index) => index);
    const indexes = new Set<number>();
    const add = (key: string) => {
      const index = indexByKey.get(key);
      if (index !== undefined) indexes.add(index);
    };
    for (const key of windowState.keys) add(key);
    for (const key of alwaysMountedKeys) add(key);
    for (const key of interactionPins) add(key);
    return [...indexes].sort((left, right) => left - right);
  }, [
    alwaysMountedKeys,
    indexByKey,
    interactionPins,
    itemKeys,
    windowState.keys,
    windowingEnabled,
  ]);

  const liveRef = useRef({
    estimateItemHeight,
    gap,
    indexByKey,
    itemKeys,
    mountedIndexes,
    renderedHeights: windowState.heights,
    scrollRootUsable,
    windowKeys: windowState.keys,
    windowingEnabled,
  });
  useLayoutEffect(() => {
    liveRef.current = {
      estimateItemHeight,
      gap,
      indexByKey,
      itemKeys,
      mountedIndexes,
      renderedHeights: windowState.heights,
      scrollRootUsable,
      windowKeys: windowState.keys,
      windowingEnabled,
    };
  });

  const modelCacheRef = useRef<{
    itemKeys: readonly string[];
    mountedIndexes: readonly number[];
    renderedHeights: ReadonlyMap<string, number>;
    revision: number;
    model: LayoutModel;
  } | null>(null);
  const measurementRevisionRef = useRef(0);
  const renderedModel = useCallback((): LayoutModel => {
    const live = liveRef.current;
    const cached = modelCacheRef.current;
    if (
      cached !== null &&
      cached.itemKeys === live.itemKeys &&
      cached.mountedIndexes === live.mountedIndexes &&
      cached.renderedHeights === live.renderedHeights &&
      cached.revision === measurementRevisionRef.current
    ) {
      return cached.model;
    }
    const heights = new Map(live.renderedHeights);
    for (const index of live.mountedIndexes) {
      const key = live.itemKeys[index];
      const height = key === undefined ? undefined : measurements.get(key);
      if (key !== undefined && height !== undefined) heights.set(key, height);
    }
    const model = buildModel(
      live.itemKeys,
      heights,
      live.estimateItemHeight,
      live.gap,
    );
    modelCacheRef.current = {
      itemKeys: live.itemKeys,
      mountedIndexes: live.mountedIndexes,
      renderedHeights: live.renderedHeights,
      revision: measurementRevisionRef.current,
      model,
    };
    return model;
  }, [measurements]);

  const record = useCallback(
    (key: string, height: number): boolean => {
      if (height <= 0 || measurements.get(key) === height) return false;
      recordTimelineMeasurement(measurements, key, height);
      measurementRevisionRef.current += 1;
      return true;
    },
    [measurements],
  );

  const observerRef = useRef<ResizeObserver | null>(null);
  const getObserver = useCallback((): ResizeObserver | null => {
    if (observerRef.current !== null) return observerRef.current;
    if (typeof ResizeObserver === "undefined") return null;
    observerRef.current = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) {
        const key = entry.target.getAttribute(WINDOW_KEY_ATTRIBUTE);
        if (key === null) continue;
        const height =
          entry.borderBoxSize?.[0]?.blockSize ??
          entry.target.getBoundingClientRect().height;
        if (record(key, height)) changed = true;
      }
      if (changed) positionKeeper?.reconcile();
    });
    return observerRef.current;
  }, [positionKeeper, record]);

  useLayoutEffect(
    () => () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
    },
    [],
  );

  const itemRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (node === null) return undefined;
      const key = node.getAttribute(WINDOW_KEY_ATTRIBUTE);
      if (key !== null) record(key, node.getBoundingClientRect().height);
      const observer = getObserver();
      observer?.observe(node);
      return () => {
        observer?.unobserve(node);
      };
    },
    [getObserver, record],
  );

  const frameUpdatesRef = useRef({ count: 0, frame: null as number | null });
  const takeFrameUpdate = useCallback((): boolean => {
    const budget = frameUpdatesRef.current;
    if (budget.frame === null) {
      budget.frame = requestAnimationFrame(() => {
        budget.frame = null;
        budget.count = 0;
      });
    }
    budget.count += 1;
    return budget.count <= MAX_WINDOW_UPDATES_PER_FRAME;
  }, []);
  const retryFrameRef = useRef<number | null>(null);
  const syncWindowRef = useRef<
    (urgent: boolean, inNextFrame: boolean) => void
  >(() => undefined);
  const scheduleNextFrameSync = useCallback(() => {
    if (retryFrameRef.current !== null) return;
    retryFrameRef.current = requestAnimationFrame(() => {
      retryFrameRef.current = null;
      syncWindowRef.current(true, true);
    });
  }, []);
  useLayoutEffect(
    () => () => {
      const frame = frameUpdatesRef.current.frame;
      if (frame !== null) cancelAnimationFrame(frame);
      if (retryFrameRef.current !== null) {
        cancelAnimationFrame(retryFrameRef.current);
        retryFrameRef.current = null;
      }
    },
    [],
  );
  const motionRef = useRef<ScrollMotionSample | null>(null);
  const sampleVelocity = useCallback((localTop: number): number => {
    const now = performance.now();
    const previous = motionRef.current;
    let velocity = 0;
    if (previous !== null) {
      const elapsed = now - previous.time;
      if (elapsed <= 0) {
        velocity = previous.velocity;
      } else if (elapsed <= MAX_VELOCITY_SAMPLE_GAP_MS) {
        velocity = (localTop - previous.localTop) / elapsed;
      }
    }
    motionRef.current = { localTop, time: now, velocity };
    return velocity;
  }, []);

  const syncWindow = useCallback(
    (urgent: boolean, inNextFrame = false) => {
      const live = liveRef.current;
      const scrollRoot = positionKeeper?.getScrollElement() ?? null;
      if (scrollRoot !== null) {
        const usable = scrollRoot.clientHeight > 0;
        if (usable !== live.scrollRootUsable) {
          if (usable && live.scrollRootUsable === false) {
            setWindowState((current) => ({
              keys: current.keys,
              heights: knownHeights(
                live.itemKeys,
                measurements,
                current.heights,
              ),
            }));
          }
          live.scrollRootUsable = usable;
          setScrollRootUsable(usable);
        }
      }
      if (!live.windowingEnabled || positionKeeper === null) return;
      const container = containerRef.current;
      const scrollElement = positionKeeper.getScrollElement();
      if (container === null || scrollElement === null) return;
      const viewportHeight =
        positionKeeper.getViewportHeight() || scrollElement.clientHeight;
      if (viewportHeight <= 0) return;
      const model = renderedModel();
      const localTop =
        scrollElement.getBoundingClientRect().top -
        container.getBoundingClientRect().top;
      const visible = visibleRange(model, localTop, viewportHeight);
      if (visible.end < visible.start) return;
      const mounted = new Set(live.mountedIndexes);
      let uncovered = false;
      for (let index = visible.start; index <= visible.end; index += 1) {
        if (!mounted.has(index)) {
          uncovered = true;
          break;
        }
      }
      const velocity = inNextFrame
        ? (motionRef.current?.velocity ?? 0)
        : sampleVelocity(localTop);
      const overscan = overscanFor(viewportHeight, velocity);
      const windowIndexes: number[] = [];
      for (const key of live.windowKeys) {
        const index = live.indexByKey.get(key);
        if (index !== undefined) windowIndexes.push(index);
      }
      const first = windowIndexes.length ? Math.min(...windowIndexes) : 0;
      const last = windowIndexes.length ? Math.max(...windowIndexes) : -1;
      const windowTop = model.offsets[first] ?? 0;
      const windowBottom =
        last < 0 ? 0 : (model.offsets[last] ?? 0) + (model.heights[last] ?? 0);
      const viewportBottom = localTop + viewportHeight;
      const mountToTop = reachesListTop(model, visible, viewportHeight);
      const nearEdge =
        (mountToTop && first > 0) ||
        (first > 0 && localTop - windowTop < overscan.before / 2) ||
        (last < live.itemKeys.length - 1 &&
          windowBottom - viewportBottom < overscan.after / 2) ||
        (!mountToTop &&
          localTop - windowTop >
            RETAINED_OVERSCAN_MULTIPLE * overscan.before) ||
        windowBottom - viewportBottom >
          RETAINED_OVERSCAN_MULTIPLE * overscan.after;
      if (!uncovered && !nearEdge) return;
      if (!uncovered && !inNextFrame) {
        scheduleNextFrameSync();
        return;
      }
      const keys = windowKeysAround(
        live.itemKeys,
        model,
        localTop,
        viewportHeight,
        overscan,
        mountToTop,
      );
      const heldKey = heldKeyOf(positionKeeper);
      if (heldKey !== null && live.indexByKey.has(heldKey)) keys.add(heldKey);
      if (sameKeys(keys, live.windowKeys)) return;
      if (!takeFrameUpdate()) {
        scheduleNextFrameSync();
        return;
      }
      const heights = knownHeights(
        live.itemKeys,
        measurements,
        live.renderedHeights,
      );
      const apply = () => setWindowState({ keys, heights });
      if (urgent && uncovered) {
        flushSync(apply);
      } else {
        apply();
      }
    },
    [
      measurements,
      positionKeeper,
      renderedModel,
      sampleVelocity,
      scheduleNextFrameSync,
      takeFrameUpdate,
    ],
  );
  useLayoutEffect(() => {
    syncWindowRef.current = syncWindow;
  }, [syncWindow]);

  useLayoutEffect(() => {
    if (positionKeeper === null) return;
    return positionKeeper.registerList({
      itemAt: (viewportTop) => {
        const live = liveRef.current;
        const container = containerRef.current;
        if (container === null || live.itemKeys.length === 0) return null;
        const model = renderedModel();
        const containerTop = container.getBoundingClientRect().top;
        const localTop = viewportTop - containerTop;
        if (localTop > model.total) return null;
        const index = indexAtOffset(model, Math.max(0, localTop));
        const key = live.itemKeys[index];
        if (key === undefined) return null;
        return { key, top: containerTop + (model.offsets[index] ?? 0) };
      },
      onPositionChange: syncWindow,
    });
  }, [positionKeeper, renderedModel, syncWindow]);

  const mountHeldKey = useCallback((): boolean => {
    if (positionKeeper === null) return false;
    const live = liveRef.current;
    const heldKey = heldKeyOf(positionKeeper);
    if (heldKey === null || !live.windowingEnabled) return false;
    const index = live.indexByKey.get(heldKey);
    if (index === undefined || live.mountedIndexes.includes(index)) {
      return false;
    }
    setWindowState((current) => ({
      keys: new Set([...current.keys, heldKey]),
      heights: current.heights,
    }));
    return true;
  }, [positionKeeper]);

  useLayoutEffect(() => {
    if (positionKeeper === null || mountHeldKey()) return;
    positionKeeper.reconcile(false);
    syncWindow(false);
  });

  const retainInteractedItem = useCallback(
    (event: SyntheticEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (container === null) return;
      const key = findOwnedWindowKey(event.target, container, indexByKey);
      if (key === null) return;
      setInteractionPins((previous) => {
        if (previous.at(-1) === key) return previous;
        const next = previous.filter((candidate) => candidate !== key);
        next.push(key);
        return next.slice(-MAX_INTERACTION_PINS);
      });
    },
    [indexByKey],
  );

  const children: ReactNode[] = [];
  let previous = -1;
  for (const index of mountedIndexes) {
    if (index > previous + 1) {
      children.push(
        <div
          key={`spacer:${itemKeys[previous + 1] ?? previous + 1}`}
          aria-hidden
          data-timeline-window-spacer=""
          style={{ height: spacerHeight(renderModel, previous + 1, index - 1) }}
        />,
      );
    }
    children.push(renderItem(index, { itemRef, windowingEnabled }));
    previous = index;
  }
  if (mountedIndexes.length > 0 && previous < itemKeys.length - 1) {
    children.push(
      <div
        key="spacer:end"
        aria-hidden
        data-timeline-window-spacer=""
        style={{
          height: spacerHeight(renderModel, previous + 1, itemKeys.length - 1),
        }}
      />,
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex w-full min-w-0 flex-col"
      style={{ gap }}
      data-timeline-items=""
      data-timeline-virtual-spacer={windowingEnabled ? "" : undefined}
      onClickCapture={retainInteractedItem}
      onFocusCapture={retainInteractedItem}
    >
      {children}
    </div>
  );
}
