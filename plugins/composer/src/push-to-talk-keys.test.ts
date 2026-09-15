// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  shouldStartPushToTalk,
  type PushToTalkKeyContext,
  type PushToTalkKeyEvent,
} from "./push-to-talk-keys";

function spaceEvent(
  target: EventTarget | null,
  overrides: Partial<PushToTalkKeyEvent> = {},
): PushToTalkKeyEvent {
  return {
    code: "Space",
    key: " ",
    repeat: false,
    isComposing: false,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target,
    ...overrides,
  };
}

function context(
  overrides: Partial<PushToTalkKeyContext> = {},
): PushToTalkKeyContext {
  return {
    enabled: true,
    composerElement: null,
    composerIsEmpty: true,
    composerLocked: false,
    hasOpenOverlay: false,
    ...overrides,
  };
}

function mount(html: string): HTMLElement {
  const root = document.createElement("div");
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("shouldStartPushToTalk", () => {
  it("starts from the document body with a plain Space", () => {
    expect(shouldStartPushToTalk(spaceEvent(document.body), context())).toBe(
      true,
    );
    expect(shouldStartPushToTalk(spaceEvent(null), context())).toBe(true);
  });

  it("starts from an empty focused composer but types a space once it has text", () => {
    const root = mount(
      '<div role="textbox" contenteditable="true"><p></p></div>',
    );
    const composer = root.querySelector<HTMLElement>("[role=textbox]");
    const paragraph = root.querySelector("p");
    expect(
      shouldStartPushToTalk(
        spaceEvent(paragraph),
        context({ composerElement: composer, composerIsEmpty: true }),
      ),
    ).toBe(true);
    expect(
      shouldStartPushToTalk(
        spaceEvent(paragraph),
        context({ composerElement: composer, composerIsEmpty: false }),
      ),
    ).toBe(false);
  });

  it("leaves Space alone in other inputs, buttons, links, menus, and editable regions", () => {
    const root = mount(`
      <input id="search" />
      <textarea id="notes"></textarea>
      <button id="run">Run</button>
      <a id="link" href="#">Open</a>
      <div id="menu" role="menu"><div id="item" role="menuitem">Item</div></div>
      <div id="editor" contenteditable="true"><span id="inner">x</span></div>
      <div id="tabs"><div id="tab" role="tab">Tab</div></div>
    `);
    for (const id of [
      "search",
      "notes",
      "run",
      "link",
      "item",
      "inner",
      "tab",
    ]) {
      const target = root.querySelector(`#${id}`);
      expect(shouldStartPushToTalk(spaceEvent(target), context()), id).toBe(
        false,
      );
    }
  });

  it("starts from non-interactive elements such as the message list", () => {
    const root = mount(
      '<main><div id="scroller" tabindex="-1"><p id="text">hi</p></div></main>',
    );
    expect(
      shouldStartPushToTalk(spaceEvent(root.querySelector("#text")), context()),
    ).toBe(true);
    expect(
      shouldStartPushToTalk(
        spaceEvent(root.querySelector("#scroller")),
        context(),
      ),
    ).toBe(true);
  });

  it("ignores modifiers, key repeat, composition, other keys, and disabled states", () => {
    const body = document.body;
    expect(
      shouldStartPushToTalk(spaceEvent(body, { repeat: true }), context()),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(spaceEvent(body, { isComposing: true }), context()),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(spaceEvent(body, { metaKey: true }), context()),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(spaceEvent(body, { shiftKey: true }), context()),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(
        spaceEvent(body, { code: "Enter", key: "Enter" }),
        context(),
      ),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(spaceEvent(body), context({ enabled: false })),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(
        spaceEvent(body),
        context({ composerLocked: true }),
      ),
    ).toBe(false);
    expect(
      shouldStartPushToTalk(
        spaceEvent(body),
        context({ hasOpenOverlay: true }),
      ),
    ).toBe(false);
  });
});
