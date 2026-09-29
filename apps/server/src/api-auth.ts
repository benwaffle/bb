import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  API_SESSION_TOKEN_QUERY_PARAM,
  API_TOKEN_COOKIE_NAME,
} from "@bb/config/api-auth";
import { isLoopbackAddress, isLoopbackHostname } from "@bb/config/loopback";
import { getAppSettings, type DbConnection } from "@bb/db";
import { getTrustedRemoteAddress } from "./request-context.js";
import type { ServerRuntimeConfig } from "./types.js";

interface ApiAuthDeps {
  config: Pick<
    ServerRuntimeConfig,
    "apiToken" | "appUrl" | "restrictHostHeaderToLoopback"
  >;
}

interface HostHeaderDeps {
  config: Pick<ServerRuntimeConfig, "appUrl" | "restrictHostHeaderToLoopback">;
  db: DbConnection;
}

interface ApiAuthRequestContext {
  req: {
    url: string;
    header(name: string): string | undefined;
    query(name: string): string | undefined;
  };
}

export interface ApiAuthProblem {
  status: 401 | 421;
  code: "unauthorized" | "misdirected_request";
  error: string;
}

interface FileReadRequestContext {
  req: {
    method: string;
    url: string;
    header(name: string): string | undefined;
  };
}

type FileReadScope =
  | { kind: "thread-storage" }
  | { kind: "directory"; path: string };

const SESSION_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const FILE_READ_COOKIE_NAME = "bb_file_read";
const FILE_READ_COOKIE_MAX_AGE_SECONDS = 10 * 60;
const FILE_READ_SIGNATURE_CONTEXT = "bb-file-read:v1";
const THREAD_STORAGE_SCOPE_TOKEN = "s";
const DIRECTORY_SCOPE_TOKEN_PREFIX = "d";
const THREAD_STORAGE_COOKIE_PATH = "/api/v1/threads/";
const COOKIE_PATH_PATTERN = /^\/[\x21-\x3A\x3C-\x7E]{0,1023}$/u;
const THREAD_STORAGE_FILE_PATH =
  /^\/api\/v1\/threads\/[^/]+\/thread-storage\/files\/./u;
const RAW_FILE_PATHS = [
  THREAD_STORAGE_FILE_PATH,
  /^\/api\/v1\/threads\/[^/]+\/host-files\/./u,
  /^\/api\/v1\/hosts\/[^/]+\/files\/./u,
  /^\/api\/v1\/environments\/[^/]+\/files\/./u,
  /^\/api\/v1\/environments\/[^/]+\/revisions\/[^/]+\/files\/./u,
  /^\/api\/v1\/projects\/[^/]+\/files\/./u,
  /^\/api\/v1\/projects\/[^/]+\/hosts\/[^/]+\/files\/./u,
  /^\/api\/v1\/file-previews\/[^/]+\/./u,
];

function cookieValues(header: string | undefined, name: string): string[] {
  const values: string[] = [];
  if (header === undefined) {
    return values;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (part.slice(0, separator).trim() === name) {
      values.push(part.slice(separator + 1).trim());
    }
  }
  return values;
}

function parseCookieHeader(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (header === undefined) {
    return cookies;
  }
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (name.length > 0 && !cookies.has(name)) {
      cookies.set(name, value);
    }
  }
  return cookies;
}

function parseBearerToken(header: string | undefined): string | null {
  if (header === undefined) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/iu.exec(header.trim());
  return match === null ? null : match[1];
}

export function presentedApiToken(
  context: ApiAuthRequestContext,
): string | null {
  const bearer = parseBearerToken(context.req.header("authorization"));
  if (bearer !== null) {
    return bearer;
  }
  return (
    parseCookieHeader(context.req.header("cookie")).get(
      API_TOKEN_COOKIE_NAME,
    ) ?? null
  );
}

export function bearerTokenAuthenticated(
  context: ApiAuthRequestContext,
  deps: { config: Pick<ServerRuntimeConfig, "apiToken"> },
): boolean {
  const expected = deps.config.apiToken;
  if (expected === null) {
    return false;
  }
  const bearer = parseBearerToken(context.req.header("authorization"));
  return bearer !== null && apiTokenMatches(bearer, expected);
}

export function apiTokenMatches(presented: string, expected: string): boolean {
  const presentedDigest = createHash("sha256").update(presented).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(presentedDigest, expectedDigest);
}

export function apiAuthProblem(
  context: ApiAuthRequestContext,
  deps: ApiAuthDeps,
): ApiAuthProblem | null {
  const expected = deps.config.apiToken;
  if (expected === null) {
    return null;
  }
  const presented = presentedApiToken(context);
  if (presented !== null && apiTokenMatches(presented, expected)) {
    return null;
  }
  return {
    status: 401,
    code: "unauthorized",
    error:
      "This bb server requires a local API token. Open the session link printed by bb-app, or send it as a bearer token.",
  };
}

export function sessionTokenFromQuery(
  context: ApiAuthRequestContext,
  deps: ApiAuthDeps,
): boolean {
  const expected = deps.config.apiToken;
  const presented = context.req.query(API_SESSION_TOKEN_QUERY_PARAM);
  if (expected === null || presented === undefined) {
    return false;
  }
  return apiTokenMatches(presented, expected);
}

function requestHostname(context: ApiAuthRequestContext): string | null {
  const host = context.req.header("host");
  if (host === undefined || host.length === 0) {
    return null;
  }
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

function urlHostname(url: string | null | undefined): string | null {
  if (url === null || url === undefined) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// A loopback-bound server only answers to loopback names. A page on
// attacker.example that resolves to 127.0.0.1 sends "Host: attacker.example",
// so rejecting foreign Host headers closes DNS rebinding at the door.
export function hostHeaderProblem(
  context: ApiAuthRequestContext,
  deps: HostHeaderDeps,
): ApiAuthProblem | null {
  if (!deps.config.restrictHostHeaderToLoopback) {
    return null;
  }
  const hostname = requestHostname(context);
  if (hostname === null) {
    return {
      status: 421,
      code: "misdirected_request",
      error: "A valid Host header is required",
    };
  }
  if (
    isLoopbackHostname(hostname) ||
    hostname === urlHostname(deps.config.appUrl) ||
    hostname === urlHostname(getAppSettings(deps.db).machineServerUrl)
  ) {
    return null;
  }
  return {
    status: 421,
    code: "misdirected_request",
    error: `Host "${hostname}" is not served by this loopback-only bb server`,
  };
}

export function isServerMachineRequest(
  context: ApiAuthRequestContext &
    Parameters<typeof getTrustedRemoteAddress>[0],
  deps: { config: Pick<ServerRuntimeConfig, "apiToken"> },
): boolean {
  if (bearerTokenAuthenticated(context, deps)) {
    return true;
  }
  const remoteAddress = getTrustedRemoteAddress(context);
  if (remoteAddress === undefined || !isLoopbackAddress(remoteAddress)) {
    return false;
  }
  if (!isLoopbackHostname(new URL(context.req.url).hostname)) {
    return false;
  }
  if (context.req.header("host") === undefined) {
    return true;
  }
  const hostname = requestHostname(context);
  return hostname !== null && isLoopbackHostname(hostname);
}

export function buildSessionCookie(args: {
  secure: boolean;
  token: string;
}): string {
  const attributes = [
    `${API_TOKEN_COOKIE_NAME}=${args.token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${SESSION_COOKIE_MAX_AGE_SECONDS}`,
  ];
  if (args.secure) {
    attributes.push("Secure");
  }
  return attributes.join("; ");
}

export function isSafeRedirectPath(value: string): boolean {
  return (
    value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")
  );
}

function isRawFilePath(path: string): boolean {
  return RAW_FILE_PATHS.some((pattern) => pattern.test(path));
}

function encodeFileReadScope(scope: FileReadScope): string {
  return scope.kind === "thread-storage"
    ? THREAD_STORAGE_SCOPE_TOKEN
    : `${DIRECTORY_SCOPE_TOKEN_PREFIX}${Buffer.from(scope.path).toString("base64url")}`;
}

function decodeFileReadScope(token: string): FileReadScope | null {
  if (token === THREAD_STORAGE_SCOPE_TOKEN) {
    return { kind: "thread-storage" };
  }
  if (!token.startsWith(DIRECTORY_SCOPE_TOKEN_PREFIX)) {
    return null;
  }
  const path = Buffer.from(
    token.slice(DIRECTORY_SCOPE_TOKEN_PREFIX.length),
    "base64url",
  ).toString("utf8");
  return path.endsWith("/") && isRawFilePath(`${path}x`)
    ? { kind: "directory", path }
    : null;
}

function fileReadScopeCovers(scope: FileReadScope, path: string): boolean {
  return scope.kind === "thread-storage"
    ? THREAD_STORAGE_FILE_PATH.test(path)
    : path.startsWith(scope.path) && isRawFilePath(path);
}

function signFileReadCapability(
  apiToken: string,
  scopeToken: string,
  expiresAtSeconds: number,
): string {
  return createHmac("sha256", apiToken)
    .update(`${FILE_READ_SIGNATURE_CONTEXT}:${scopeToken}:${expiresAtSeconds}`)
    .digest("base64url");
}

function fileReadCapabilityCovers(args: {
  apiToken: string;
  path: string;
  value: string;
}): boolean {
  const [expires, scopeToken, signature, ...rest] = args.value.split(".");
  if (
    expires === undefined ||
    scopeToken === undefined ||
    signature === undefined ||
    rest.length > 0 ||
    !/^[0-9]{1,12}$/u.test(expires)
  ) {
    return false;
  }
  const expiresAtSeconds = Number(expires);
  if (expiresAtSeconds * 1000 <= Date.now()) {
    return false;
  }
  const scope = decodeFileReadScope(scopeToken);
  return (
    scope !== null &&
    fileReadScopeCovers(scope, args.path) &&
    apiTokenMatches(
      signature,
      signFileReadCapability(args.apiToken, scopeToken, expiresAtSeconds),
    )
  );
}

function buildFileReadCookie(args: {
  apiToken: string;
  cookiePath: string;
  expiresAtSeconds: number;
  scope: FileReadScope;
}): string {
  const scopeToken = encodeFileReadScope(args.scope);
  const signature = signFileReadCapability(
    args.apiToken,
    scopeToken,
    args.expiresAtSeconds,
  );
  return [
    `${FILE_READ_COOKIE_NAME}=${args.expiresAtSeconds}.${scopeToken}.${signature}`,
    `Path=${args.cookiePath}`,
    "HttpOnly",
    "Secure",
    "SameSite=None",
    `Max-Age=${FILE_READ_COOKIE_MAX_AGE_SECONDS}`,
  ].join("; ");
}

export function fileReadCookiesForResponse(
  context: FileReadRequestContext,
  response: Response,
  deps: { config: Pick<ServerRuntimeConfig, "apiToken"> },
): string[] {
  const apiToken = deps.config.apiToken;
  const contentType = response.headers.get("content-type") ?? "";
  const path = new URL(context.req.url).pathname;
  if (
    apiToken === null ||
    context.req.method.toUpperCase() !== "GET" ||
    response.status !== 200 ||
    contentType.split(";", 1)[0]?.trim().toLowerCase() !== "text/html" ||
    !isRawFilePath(path)
  ) {
    return [];
  }
  const expiresAtSeconds =
    Math.floor(Date.now() / 1000) + FILE_READ_COOKIE_MAX_AGE_SECONDS;
  const cookies = [
    buildFileReadCookie({
      apiToken,
      cookiePath: THREAD_STORAGE_COOKIE_PATH,
      expiresAtSeconds,
      scope: { kind: "thread-storage" },
    }),
  ];
  const directory = path.slice(0, path.lastIndexOf("/") + 1);
  if (
    !THREAD_STORAGE_FILE_PATH.test(path) &&
    COOKIE_PATH_PATTERN.test(directory) &&
    isRawFilePath(`${directory}x`)
  ) {
    cookies.push(
      buildFileReadCookie({
        apiToken,
        cookiePath: directory,
        expiresAtSeconds,
        scope: { kind: "directory", path: directory },
      }),
    );
  }
  return cookies;
}

export function fileReadCookieAuthenticated(
  context: FileReadRequestContext,
  deps: { config: Pick<ServerRuntimeConfig, "apiToken"> },
): boolean {
  const apiToken = deps.config.apiToken;
  const method = context.req.method.toUpperCase();
  if (apiToken === null || (method !== "GET" && method !== "HEAD")) {
    return false;
  }
  const path = new URL(context.req.url).pathname;
  if (!isRawFilePath(path)) {
    return false;
  }
  return cookieValues(context.req.header("cookie"), FILE_READ_COOKIE_NAME).some(
    (value) => fileReadCapabilityCovers({ apiToken, path, value }),
  );
}
