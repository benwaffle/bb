import { isRecord, type TranscriptRecord } from "./transcript-conversion.js";

const BB_BRIDGE_TOOL_PREFIX = "mcp__bb-bridge__";
const BB_PLUGIN_PROMPT = "instructions come from the BB plugin";

const DEFERRED_TOOL_NAME_KEYS = [
  "addedNames",
  "removedNames",
  "wireHiddenNames",
  "readdedNames",
] as const;

function namesBbBridgeTool(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(BB_BRIDGE_TOOL_PREFIX);
}

function someEntry(value: unknown, predicate: (entry: unknown) => boolean) {
  return Array.isArray(value) && value.some(predicate);
}

function deferredToolsNameBbBridge(attachment: TranscriptRecord): boolean {
  return DEFERRED_TOOL_NAME_KEYS.some((key) =>
    someEntry(attachment[key], namesBbBridgeTool),
  );
}

function promptSnapshotShowsBb(attachment: TranscriptRecord): boolean {
  const carriesBbPluginInstructions = someEntry(
    attachment.systemPrompt,
    (entry) => typeof entry === "string" && entry.includes(BB_PLUGIN_PROMPT),
  );
  if (carriesBbPluginInstructions) return true;
  return someEntry(attachment.tools, (tool) =>
    isRecord(tool) ? namesBbBridgeTool(tool.name) : false,
  );
}

export function recordShowsBbSession(record: TranscriptRecord): boolean {
  const attachment = isRecord(record.attachment) ? record.attachment : null;
  if (attachment !== null) {
    if (attachment.type === "deferred_tools_delta") {
      return deferredToolsNameBbBridge(attachment);
    }
    if (attachment.type === "prompt_snapshot") {
      return promptSnapshotShowsBb(attachment);
    }
    return false;
  }
  const message = isRecord(record.message) ? record.message : null;
  return someEntry(
    message?.content,
    (block) =>
      isRecord(block) &&
      block.type === "tool_use" &&
      namesBbBridgeTool(block.name),
  );
}
