import type { BbDesktopApi } from "@bb/desktop-contract";

export const WINDOW_INACTIVE_ATTRIBUTE = "data-window-inactive";
export const WINDOW_INACTIVE_DELAY_MS = 2_000;

type WindowStateSource = Pick<
  BbDesktopApi,
  "getWindowState" | "onWindowStateChange"
>;

interface InstallWindowInactiveAttributeArgs {
  root: HTMLElement;
  desktopApi: WindowStateSource | null;
}

export function installWindowInactiveAttribute(
  args: InstallWindowInactiveAttributeArgs,
): () => void {
  const ownerDocument = args.root.ownerDocument;
  const defaultView = ownerDocument.defaultView;
  if (defaultView === null) return () => {};
  const ownerWindow: Window = defaultView;
  const desktopFocus = args.desktopApi?.onWindowStateChange !== undefined;
  let focused = desktopFocus || ownerDocument.hasFocus();
  let timer: number | null = null;

  function clearTimer(): void {
    if (timer === null) return;
    ownerWindow.clearTimeout(timer);
    timer = null;
  }

  function update(): void {
    if (focused && ownerDocument.visibilityState === "visible") {
      clearTimer();
      args.root.removeAttribute(WINDOW_INACTIVE_ATTRIBUTE);
      return;
    }
    if (timer !== null || args.root.hasAttribute(WINDOW_INACTIVE_ATTRIBUTE)) {
      return;
    }
    timer = ownerWindow.setTimeout(() => {
      timer = null;
      args.root.setAttribute(WINDOW_INACTIVE_ATTRIBUTE, "");
    }, WINDOW_INACTIVE_DELAY_MS);
  }

  function setFocused(next: boolean): void {
    focused = next;
    update();
  }

  const handleFocus = (): void => setFocused(true);
  const handleBlur = (): void => setFocused(false);
  const unsubscribeDesktop = desktopFocus
    ? args.desktopApi?.onWindowStateChange?.((state) => {
        setFocused(state.isFocused !== false);
      })
    : undefined;
  if (desktopFocus) {
    void args.desktopApi?.getWindowState?.().then((state) => {
      setFocused(state.isFocused !== false);
    });
  } else {
    ownerWindow.addEventListener("focus", handleFocus);
    ownerWindow.addEventListener("blur", handleBlur);
  }
  ownerDocument.addEventListener("visibilitychange", update);
  update();

  return () => {
    clearTimer();
    unsubscribeDesktop?.();
    ownerWindow.removeEventListener("focus", handleFocus);
    ownerWindow.removeEventListener("blur", handleBlur);
    ownerDocument.removeEventListener("visibilitychange", update);
    args.root.removeAttribute(WINDOW_INACTIVE_ATTRIBUTE);
  };
}
