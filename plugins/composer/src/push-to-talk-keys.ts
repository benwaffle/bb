export interface PushToTalkKeyEvent {
  readonly code: string;
  readonly key: string;
  readonly repeat: boolean;
  readonly isComposing: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
  readonly target: EventTarget | null;
}

export interface PushToTalkKeyContext {
  readonly enabled: boolean;
  readonly composerElement: HTMLElement | null;
  readonly composerIsEmpty: boolean;
  readonly composerLocked: boolean;
  readonly hasOpenOverlay: boolean;
}

const INTERACTIVE_SELECTOR = [
  "input",
  "textarea",
  "select",
  "button",
  "summary",
  "a[href]",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='combobox']",
  "[role='button']",
  "[role='menuitem']",
  "[role='menuitemcheckbox']",
  "[role='menuitemradio']",
  "[role='option']",
  "[role='checkbox']",
  "[role='radio']",
  "[role='switch']",
  "[role='slider']",
  "[role='tab']",
  "[role='link']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[role='menu']",
  "[role='listbox']",
].join(",");

export const OPEN_OVERLAY_SELECTOR =
  "[role='dialog'][data-state='open'],[role='alertdialog'][data-state='open'],[role='menu'][data-state='open'],[role='listbox'][data-state='open'],[data-slot='command-dialog']";

export function isSpaceKey(
  event: Pick<PushToTalkKeyEvent, "code" | "key">,
): boolean {
  return (
    event.code === "Space" || event.key === " " || event.key === "Spacebar"
  );
}

function hasModifier(event: PushToTalkKeyEvent): boolean {
  return event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
}

function targetElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function isDocumentLevelTarget(element: Element | null): boolean {
  if (element === null) return true;
  const tag = element.tagName.toLowerCase();
  return tag === "body" || tag === "html";
}

export function shouldStartPushToTalk(
  event: PushToTalkKeyEvent,
  context: PushToTalkKeyContext,
): boolean {
  if (!context.enabled || context.composerLocked || context.hasOpenOverlay) {
    return false;
  }
  if (!isSpaceKey(event) || event.repeat || event.isComposing) {
    return false;
  }
  if (hasModifier(event)) return false;

  const target = targetElement(event.target);
  const composer = context.composerElement;
  if (composer !== null && target !== null && composer.contains(target)) {
    return context.composerIsEmpty;
  }
  if (isDocumentLevelTarget(target)) return true;
  return target?.closest(INTERACTIVE_SELECTOR) === null;
}
