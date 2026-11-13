const BYTES_PER_MB = 1024 * 1024;
const MIN_GPU_MEMORY_MB = 512;
const MAX_GPU_MEMORY_MB = 4096;

export function resolveRendererGpuMemoryMb(totalMemoryBytes: number): number {
  const quarterOfMemoryMb = Math.floor(totalMemoryBytes / BYTES_PER_MB / 4);
  return Math.max(
    MIN_GPU_MEMORY_MB,
    Math.min(MAX_GPU_MEMORY_MB, quarterOfMemoryMb),
  );
}
