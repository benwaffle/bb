export interface GitRemote {
  host: string;
  owner: string;
  repo: string;
}

const SCP_REMOTE = /^(?:[\w.-]+@)?([\w.-]+):(?!\/\/)(.+)$/;

export function parseGitRemote(remoteUrl: string | null): GitRemote | null {
  if (remoteUrl === null) return null;
  const trimmed = remoteUrl.trim();
  if (trimmed === "") return null;
  let host: string;
  let path: string;
  const scp = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? null
    : SCP_REMOTE.exec(trimmed);
  if (scp !== null) {
    host = scp[1]!;
    path = scp[2]!;
  } else {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    if (url.hostname === "") return null;
    host = url.hostname;
    path = url.pathname;
  }
  const segments = path
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter((segment) => segment !== "");
  if (segments.length < 2) return null;
  return {
    host: host.toLowerCase(),
    owner: segments[0]!,
    repo: segments[segments.length - 1]!,
  };
}

export const BB_FAVICON_URL = "https://getbb.app/favicon-32x32.png";

function isBbRepository(remote: GitRemote): boolean {
  return (
    remote.owner.toLowerCase() === "get-bb" ||
    (remote.host === "github.com" && remote.repo.toLowerCase() === "bb")
  );
}

export function projectIconSourceUrl(remote: GitRemote | null): string | null {
  if (remote === null) return null;
  if (isBbRepository(remote)) return BB_FAVICON_URL;
  if (remote.host === "github.com") {
    return `https://github.com/${encodeURIComponent(remote.owner)}.png?size=64`;
  }
  return null;
}

export function projectMonogram(name: string): string {
  const words = name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== "");
  if (words.length === 0) return "?";
  if (words.length > 1) {
    return `${firstChar(words[0]!)}${firstChar(words[1]!)}`.toUpperCase();
  }
  const chars = Array.from(words[0]!);
  if (chars.length === 1) return chars[0]!.toUpperCase();
  return `${chars[0]}${chars[chars.length - 1]}`.toUpperCase();
}

function firstChar(word: string): string {
  return Array.from(word)[0] ?? "";
}

export const MONOGRAM_COLORS = [
  "#fb7185",
  "#fb923c",
  "#fbbf24",
  "#facc15",
  "#a3e635",
  "#4ade80",
  "#34d399",
  "#2dd4bf",
  "#22d3ee",
  "#38bdf8",
  "#60a5fa",
  "#818cf8",
  "#a78bfa",
  "#c084fc",
  "#e879f9",
  "#f472b6",
] as const;

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (const char of text) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

export function projectMonogramColor(name: string): string {
  const key = name.trim().toLowerCase();
  return MONOGRAM_COLORS[fnv1a(key) % MONOGRAM_COLORS.length]!;
}
