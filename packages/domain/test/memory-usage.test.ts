import { describe, expect, it } from "vitest";
import {
  formatMemoryBytes,
  formatThreadMemoryProcesses,
  formatThreadMemoryUsage,
  threadMemoryUsageSchema,
} from "../src/memory-usage.js";

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

describe("formatMemoryBytes", () => {
  it("keeps whole bytes under a kilobyte and one decimal under ten units", () => {
    expect(formatMemoryBytes(0)).toBe("0 B");
    expect(formatMemoryBytes(999)).toBe("999 B");
    expect(formatMemoryBytes(1536)).toBe("1.5 KB");
    expect(formatMemoryBytes(2.7 * GB)).toBe("2.7 GB");
  });

  it("rounds away the decimal at ten units and above", () => {
    expect(formatMemoryBytes(15.4 * MB)).toBe("15 MB");
    expect(formatMemoryBytes(512 * MB)).toBe("512 MB");
  });

  it("stops scaling at terabytes and clamps negatives to zero", () => {
    expect(formatMemoryBytes(2048 * GB)).toBe("2.0 TB");
    expect(formatMemoryBytes(-1)).toBe("0 B");
  });
});

describe("formatThreadMemoryProcesses", () => {
  const usage = (processCount: number, sharedThreadCount: number) =>
    threadMemoryUsageSchema.parse({
      rssBytes: MB,
      processCount,
      sharedThreadCount,
      sampledAt: 1_700_000_000_000,
    });

  it("pluralizes the process count and names shared attribution only when shared", () => {
    expect(formatThreadMemoryProcesses(usage(1, 1))).toBe("1 process");
    expect(formatThreadMemoryProcesses(usage(40, 1))).toBe("40 processes");
    expect(formatThreadMemoryProcesses(usage(3, 2))).toBe(
      "3 processes, shared by 2 threads",
    );
  });

  it("reads the whole figure with the byte size in front", () => {
    expect(formatThreadMemoryUsage(usage(40, 1))).toBe("1.0 MB (40 processes)");
  });
});
