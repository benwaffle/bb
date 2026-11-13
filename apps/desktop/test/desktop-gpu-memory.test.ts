import { describe, expect, it } from "vitest";
import { resolveRendererGpuMemoryMb } from "../src/desktop-gpu-memory.js";

const GB = 1024 * 1024 * 1024;

describe("resolveRendererGpuMemoryMb", () => {
  it("uses a quarter of system memory on typical machines", () => {
    expect(resolveRendererGpuMemoryMb(8 * GB)).toBe(2048);
    expect(resolveRendererGpuMemoryMb(16 * GB)).toBe(4096);
  });

  it("caps the budget at 4096 MB on large machines", () => {
    expect(resolveRendererGpuMemoryMb(36 * GB)).toBe(4096);
    expect(resolveRendererGpuMemoryMb(64 * GB)).toBe(4096);
  });

  it("never goes below 512 MB on small machines", () => {
    expect(resolveRendererGpuMemoryMb(1 * GB)).toBe(512);
    expect(resolveRendererGpuMemoryMb(2 * GB)).toBe(512);
  });

  it("rounds a fractional quarter down", () => {
    expect(resolveRendererGpuMemoryMb(3 * GB + 3)).toBe(768);
  });
});
