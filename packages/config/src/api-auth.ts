import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// The local API token is a random secret the server writes to its data dir
// on first start. Every /api/v1 request and realtime WebSocket must present
// it either as a bearer header (CLI, SDK, desktop main process) or as the
// HttpOnly cookie that the session endpoint sets for browsers.
export const API_TOKEN_FILE_NAME = "api-token";
export const API_TOKEN_ENV_NAME = "BB_API_TOKEN";
export const API_TOKEN_COOKIE_NAME = "bb_api_token";
export const API_SESSION_PATH = "/auth/session";
export const API_SESSION_TOKEN_QUERY_PARAM = "token";

interface ResolveApiTokenArgs {
  dataDir: string;
  env: NodeJS.ProcessEnv;
}

export function resolveApiTokenPath(dataDir: string): string {
  return join(dataDir, API_TOKEN_FILE_NAME);
}

export async function readApiTokenFile(
  dataDir: string,
): Promise<string | null> {
  try {
    const token = (await readFile(resolveApiTokenPath(dataDir), "utf8")).trim();
    return token.length > 0 ? token : null;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function readApiTokenFileSync(dataDir: string): string | null {
  try {
    const token = readFileSync(resolveApiTokenPath(dataDir), "utf8").trim();
    return token.length > 0 ? token : null;
  } catch (error) {
    const code =
      error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function resolveApiToken(
  args: ResolveApiTokenArgs,
): Promise<string | null> {
  const fromEnv = args.env[API_TOKEN_ENV_NAME]?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }
  return readApiTokenFile(args.dataDir);
}

export function bearerAuthorizationHeader(token: string): string {
  return `Bearer ${token}`;
}

export function buildApiSessionUrl(serverUrl: string, token: string): string {
  const url = new URL(API_SESSION_PATH, serverUrl);
  url.searchParams.set(API_SESSION_TOKEN_QUERY_PARAM, token);
  return url.toString();
}

export function withBearerAuthorization(
  init: RequestInit | undefined,
  token: string,
): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set("authorization", bearerAuthorizationHeader(token));
  return { ...init, headers };
}

export function createBearerFetch(
  token: string,
  fetchImpl: typeof fetch = fetch,
): typeof fetch {
  return (input, init) =>
    fetchImpl(input, withBearerAuthorization(init, token));
}
