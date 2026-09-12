import {
  bearerAuthorizationHeader,
  withBearerAuthorization,
} from "@bb/config/api-auth";
import { loadCliConfig } from "@bb/config/cli";
import { createNodeBbSdk, type BbSdk } from "@bb/sdk/node";
import {
  CALLER_THREAD_HEADER_NAME,
  CLI_REQUEST_HEADER_NAME,
} from "@bb/config/app-surface";
import type { Dispatcher } from "undici";
import { resolveContextThreadId } from "./context-env.js";

type CliRequestInit = RequestInit & { dispatcher?: Dispatcher };

let cachedApiToken: string | null | undefined;

// The token comes from BB_API_TOKEN or the api-token file in the data dir and
// does not change while a CLI process runs, so one lookup serves every request.
export function resolveCliApiToken(): string | null {
  if (cachedApiToken === undefined) {
    cachedApiToken = loadCliConfig().BB_API_TOKEN;
  }
  return cachedApiToken;
}

export function cliWebsocketHeaders(): Record<string, string> | undefined {
  const token = resolveCliApiToken();
  return token === null
    ? undefined
    : { authorization: bearerAuthorizationHeader(token) };
}

export function cliFetch(
  input: RequestInfo | URL,
  init?: CliRequestInit,
): Promise<Response> {
  const token = resolveCliApiToken();
  return fetch(
    input,
    token === null ? init : withBearerAuthorization(init, token),
  );
}

function cliSdkFetch(timeoutMs: number | undefined): typeof cliFetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(CLI_REQUEST_HEADER_NAME, "1");
    const callerThreadId = resolveContextThreadId();
    if (callerThreadId !== undefined) {
      headers.set(CALLER_THREAD_HEADER_NAME, callerThreadId);
    }
    if (timeoutMs === undefined) return fetch(input, { ...init, headers });
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return fetch(input, {
      ...init,
      headers,
      signal: init?.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal,
    });
  };
}

// The SDK attaches the bearer header itself, so it gets the plain fetch
// rather than cliFetch, which would set the same header a second time.
export function createCliBbSdk(baseUrl: string, timeoutMs?: number): BbSdk {
  const token = resolveCliApiToken();
  return createNodeBbSdk({
    ...(token === null ? {} : { apiToken: token }),
    baseUrl,
    fetch: cliSdkFetch(timeoutMs),
  });
}
