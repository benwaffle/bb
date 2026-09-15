import { z } from "zod";

export const threadMemoryUsageSchema = z.object({
  rssBytes: z.number().int().nonnegative(),
  processCount: z.number().int().nonnegative(),
  sharedThreadCount: z.number().int().positive(),
  sampledAt: z.number().int().nonnegative(),
});
export type ThreadMemoryUsage = z.infer<typeof threadMemoryUsageSchema>;

export const hostMemoryUsageSchema = z.object({
  rssBytes: z.number().int().nonnegative(),
  processCount: z.number().int().nonnegative(),
  sampledAt: z.number().int().nonnegative(),
});
export type HostMemoryUsage = z.infer<typeof hostMemoryUsageSchema>;

export function formatThreadMemoryProcesses(usage: ThreadMemoryUsage): string {
  const processes = `${usage.processCount} ${usage.processCount === 1 ? "process" : "processes"}`;
  return usage.sharedThreadCount > 1
    ? `${processes}, shared by ${usage.sharedThreadCount} threads`
    : processes;
}

export function formatThreadMemoryUsage(usage: ThreadMemoryUsage): string {
  return `${formatMemoryBytes(usage.rssBytes)} (${formatThreadMemoryProcesses(usage)})`;
}

const BYTES_PER_UNIT = 1024;
const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatMemoryBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unitIndex = 0;
  while (value >= BYTES_PER_UNIT && unitIndex < BYTE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT;
    unitIndex += 1;
  }
  const unit = BYTE_UNITS[unitIndex]!;
  if (unitIndex === 0) {
    return `${Math.round(value)} ${unit}`;
  }
  return `${value < 10 ? value.toFixed(1) : String(Math.round(value))} ${unit}`;
}
