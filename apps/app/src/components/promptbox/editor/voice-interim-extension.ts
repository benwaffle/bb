import { Extension, type Editor } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const VOICE_INTERIM_CLASS = "prompt-voice-interim";

interface VoiceInterimPluginState {
  readonly text: string | null;
}

const voiceInterimPluginKey = new PluginKey<VoiceInterimPluginState>(
  "voiceInterim",
);

function needsLeadingSpace(state: EditorState): boolean {
  const before = state.doc.textBetween(0, state.selection.to, "\n", "\n");
  return before.length > 0 && !/\s$/.test(before);
}

function createWidget(text: string, leadingSpace: boolean): HTMLElement {
  const span = document.createElement("span");
  span.className = VOICE_INTERIM_CLASS;
  span.setAttribute("data-voice-interim", "");
  span.setAttribute("aria-live", "polite");
  span.setAttribute("contenteditable", "false");
  span.textContent = `${leadingSpace ? " " : ""}${text}`;
  return span;
}

export function setVoiceInterimText(editor: Editor, text: string | null): void {
  const normalized = text === null ? null : text.trim();
  const current = voiceInterimPluginKey.getState(editor.state)?.text ?? null;
  const next =
    normalized === null || normalized.length === 0 ? null : normalized;
  if (current === next) return;
  editor.view.dispatch(
    editor.state.tr.setMeta(voiceInterimPluginKey, { text: next }),
  );
}

export function getVoiceInterimText(state: EditorState): string | null {
  return voiceInterimPluginKey.getState(state)?.text ?? null;
}

function metaFrom(value: unknown): VoiceInterimPluginState | null {
  if (typeof value !== "object" || value === null || !("text" in value)) {
    return null;
  }
  const text = Reflect.get(value, "text");
  return text === null || typeof text === "string" ? { text } : null;
}

export const VoiceInterimExtension = Extension.create({
  name: "voiceInterim",
  addProseMirrorPlugins() {
    return [
      new Plugin<VoiceInterimPluginState>({
        key: voiceInterimPluginKey,
        state: {
          init: () => ({ text: null }),
          apply(transaction, previous) {
            const meta = metaFrom(transaction.getMeta(voiceInterimPluginKey));
            return meta ?? previous;
          },
        },
        props: {
          decorations(state) {
            const text = voiceInterimPluginKey.getState(state)?.text ?? null;
            if (text === null) return null;
            const leadingSpace = needsLeadingSpace(state);
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                state.selection.to,
                () => createWidget(text, leadingSpace),
                {
                  side: 1,
                  key: `voice-interim:${leadingSpace ? 1 : 0}:${text}`,
                },
              ),
            ]);
          },
        },
      }),
    ];
  },
});
