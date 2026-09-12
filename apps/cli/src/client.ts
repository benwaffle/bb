import {
  bearerAuthorizationHeader,
  withBearerAuthorization,
} from "@bb/config/api-auth";
import { loadCliConfig } from "@bb/config/cli";
import { createNodeBbSdk, type BbSdk } from "@bb/sdk/node";
import type { Dispatcher } from "undici";

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

// The SDK attaches the bearer header itself, so it gets the plain fetch
// rather than cliFetch, which would set the same header a second time.
export function createCliBbSdk(baseUrl: string): BbSdk {
  const token = resolveCliApiToken();
  return createNodeBbSdk({
    ...(token === null ? {} : { apiToken: token }),
    baseUrl,
    fetch,
  });
}
