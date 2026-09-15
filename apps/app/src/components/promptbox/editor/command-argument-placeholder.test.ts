import { describe, expect, it } from "vitest";
import { getSchema } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Node } from "@tiptap/pm/model";
import type { PromptMentionResource } from "@bb/domain";
import { PromptMentionExtension } from "./prompt-mention-extension";
import { findCommandArgumentPlaceholders } from "./command-argument-placeholder";

const schema = getSchema([
  Document,
  Paragraph,
  Text,
  PromptMentionExtension,
]);

function commandResource(
  name: string,
  argumentHint: string | null,
): PromptMentionResource {
  return {
    kind: "command",
    trigger: "/",
    name,
    source: "skill",
    origin: "builtin",
    label: name,
    argumentHint,
  };
}

function mention(resource: PromptMentionResource) {
  return {
    type: "mention",
    attrs: { resource, serializedText: `/${resource.label}` },
  };
}

function paragraph(...content: unknown[]) {
  return { type: "paragraph", content };
}

function doc(...paragraphs: unknown[]) {
  return Node.fromJSON(schema, { type: "doc", content: paragraphs });
}

describe("findCommandArgumentPlaceholders", () => {
  it("places the hint after a command pill that only whitespace follows", () => {
    const document = doc(
      paragraph(mention(commandResource("code-review", "[low|medium]")), {
        type: "text",
        text: " ",
      }),
    );
    const paragraphNode = document.child(0);
    expect(findCommandArgumentPlaceholders(document, "mention")).toEqual([
      { position: 1 + paragraphNode.content.size, hint: "[low|medium]" },
    ]);
  });

  it("hides the hint once arguments are typed after the pill", () => {
    const document = doc(
      paragraph(mention(commandResource("code-review", "[low|medium]")), {
        type: "text",
        text: " low",
      }),
    );
    expect(findCommandArgumentPlaceholders(document, "mention")).toEqual([]);
  });

  it("ignores commands without a hint and pills that are not commands", () => {
    const document = doc(
      paragraph(mention(commandResource("compact", null)), {
        type: "text",
        text: " ",
      }),
      paragraph({
        type: "mention",
        attrs: {
          resource: {
            kind: "thread",
            threadId: "thr_1",
            label: "Other thread",
          },
          serializedText: "@thread",
        },
      }),
    );
    expect(findCommandArgumentPlaceholders(document, "mention")).toEqual([]);
  });

  it("hides the hint when another pill follows the command", () => {
    const document = doc(
      paragraph(
        mention(commandResource("code-review", "[low|medium]")),
        { type: "text", text: " " },
        mention(commandResource("simplify", "[<target>]")),
      ),
    );
    const paragraphNode = document.child(0);
    expect(findCommandArgumentPlaceholders(document, "mention")).toEqual([
      { position: 1 + paragraphNode.content.size, hint: "[<target>]" },
    ]);
  });

  it("finds a command on a later paragraph", () => {
    const document = doc(
      paragraph({ type: "text", text: "Please run" }),
      paragraph(mention(commandResource("simplify", "[<target>]"))),
    );
    const first = document.child(0);
    const second = document.child(1);
    expect(findCommandArgumentPlaceholders(document, "mention")).toEqual([
      {
        position: first.nodeSize + 1 + second.content.size,
        hint: "[<target>]",
      },
    ]);
  });
});
