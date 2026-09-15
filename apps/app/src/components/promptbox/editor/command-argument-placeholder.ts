import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { parsePromptEditorMentionAttrs } from "./prompt-editor-serialization";

export interface CommandArgumentPlaceholder {
  position: number;
  hint: string;
}

export const COMMAND_ARGUMENT_PLACEHOLDER_ATTRIBUTE =
  "data-command-argument-placeholder";

function commandArgumentHint(
  node: ProseMirrorNode,
  mentionName: string,
): string | null {
  if (node.type.name !== mentionName) {
    return null;
  }
  const attrs = parsePromptEditorMentionAttrs(node.attrs);
  if (attrs === null || attrs.resource.kind !== "command") {
    return null;
  }
  return attrs.resource.argumentHint;
}

function onlyWhitespaceFollows(
  parent: ProseMirrorNode,
  index: number,
): boolean {
  for (let next = index + 1; next < parent.childCount; next += 1) {
    const sibling = parent.child(next);
    if (!sibling.isText || /\S/u.test(sibling.text ?? "")) {
      return false;
    }
  }
  return true;
}

export function findCommandArgumentPlaceholders(
  doc: ProseMirrorNode,
  mentionName: string,
): CommandArgumentPlaceholder[] {
  const placeholders: CommandArgumentPlaceholder[] = [];
  doc.descendants((parent, parentPosition) => {
    if (!parent.isTextblock) {
      return true;
    }
    for (let index = 0; index < parent.childCount; index += 1) {
      const hint = commandArgumentHint(parent.child(index), mentionName);
      if (hint !== null && onlyWhitespaceFollows(parent, index)) {
        placeholders.push({
          position: parentPosition + 1 + parent.content.size,
          hint,
        });
        break;
      }
    }
    return false;
  });
  return placeholders;
}

export function createCommandArgumentPlaceholderElement(
  hint: string,
): HTMLSpanElement {
  const element = document.createElement("span");
  element.setAttribute(COMMAND_ARGUMENT_PLACEHOLDER_ATTRIBUTE, "true");
  element.className = "pointer-events-none select-none text-muted-foreground";
  element.contentEditable = "false";
  element.textContent = hint;
  return element;
}
