import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export const BACKGROUND_COMMAND_OUTPUT_TAIL_BYTES = 16 * 1024;

export function readBackgroundCommandOutputTail(
  outputFile: string,
  maxBytes: number = BACKGROUND_COMMAND_OUTPUT_TAIL_BYTES,
): string | undefined {
  let fd: number;
  try {
    fd = openSync(outputFile, "r");
  } catch {
    return undefined;
  }
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    let offset = 0;
    while (offset < length) {
      const read = readSync(fd, buffer, offset, length - offset, size - length + offset);
      if (read === 0) {
        break;
      }
      offset += read;
    }
    const text = buffer.subarray(0, offset).toString("utf8");
    return size > maxBytes ? dropPartialLeadingLine(text) : text;
  } catch {
    return undefined;
  } finally {
    closeSync(fd);
  }
}

function dropPartialLeadingLine(text: string): string {
  const newline = text.indexOf("\n");
  return newline === -1 ? text : text.slice(newline + 1);
}
