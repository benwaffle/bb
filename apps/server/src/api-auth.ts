import { createHash, timingSafeEqual } from "node:crypto";
import {
  API_SESSION_TOKEN_QUERY_PARAM,
  API_TOKEN_COOKIE_NAME,
} from "@bb/config/api-auth";
import { isLoopbackHostname } from "@bb/config/loopback";
import type { ServerRuntimeConfig } from "./types.js";

interface ApiAuthDeps {
  config: Pick<
    ServerRuntimeConfig,
    "apiToken" | "appUrl" | "restrictHostHeaderToLoopback"
  >;
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

const SESSION_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

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

function appUrlHostname(appUrl: string | undefined): string | null {
  if (appUrl === undefined) {
    return null;
  }
  try {
    return new URL(appUrl).hostname;
  } catch {
    return null;
  }
}

// A loopback-bound server only answers to loopback names. A page on
// attacker.example that resolves to 127.0.0.1 sends "Host: attacker.example",
// so rejecting foreign Host headers closes DNS rebinding at the door.
export function hostHeaderProblem(
  context: ApiAuthRequestContext,
  deps: ApiAuthDeps,
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
    hostname === appUrlHostname(deps.config.appUrl)
  ) {
    return null;
  }
  return {
    status: 421,
    code: "misdirected_request",
    error: `Host "${hostname}" is not served by this loopback-only bb server`,
  };
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
