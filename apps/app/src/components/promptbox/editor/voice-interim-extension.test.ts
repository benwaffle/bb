// @vitest-environment jsdom

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it } from "vitest";
import {
  VOICE_INTERIM_CLASS,
  VoiceInterimExtension,
  getVoiceInterimText,
  setVoiceInterimText,
} from "./voice-interim-extension";

let editor: Editor | null = null;

function createEditor(text: string): Editor {
  const element = document.createElement("div");
  document.body.append(element);
  editor = new Editor({
    element,
    extensions: [StarterKit, VoiceInterimExtension],
    content:
      text.length === 0
        ? { type: "doc", content: [{ type: "paragraph" }] }
        : {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text }] }],
          },
  });
  editor.commands.focus("end");
  return editor;
}

function widget(): HTMLElement | null {
  return (
    editor?.view.dom.querySelector<HTMLElement>(`.${VOICE_INTERIM_CLASS}`) ??
    null
  );
}

afterEach(() => {
  editor?.destroy();
  editor = null;
  document.body.innerHTML = "";
});

describe("VoiceInterimExtension", () => {
  it("renders interim text as a non-editable widget without changing the document", () => {
    const current = createEditor("Hello");
    setVoiceInterimText(current, "world");

    const rendered = widget();
    expect(rendered?.textContent).toBe(" world");
    expect(rendered?.getAttribute("contenteditable")).toBe("false");
    expect(rendered?.getAttribute("aria-live")).toBe("polite");
    expect(current.getText()).toBe("Hello");
    expect(getVoiceInterimText(current.state)).toBe("world");
  });

  it("omits the leading space in an empty composer and replaces text on update", () => {
    const current = createEditor("");
    setVoiceInterimText(current, "first words");
    expect(widget()?.textContent).toBe("first words");

    setVoiceInterimText(current, "first words and more");
    expect(
      current.view.dom.querySelectorAll(`.${VOICE_INTERIM_CLASS}`),
    ).toHaveLength(1);
    expect(widget()?.textContent).toBe("first words and more");
  });

  it("removes the widget when cleared and ignores empty updates", () => {
    const current = createEditor("Hello");
    setVoiceInterimText(current, "   ");
    expect(widget()).toBeNull();

    setVoiceInterimText(current, "there");
    expect(widget()).not.toBeNull();
    setVoiceInterimText(current, null);
    expect(widget()).toBeNull();
    expect(getVoiceInterimText(current.state)).toBeNull();
  });
});
