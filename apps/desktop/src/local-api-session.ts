import type { Cookies } from "electron";
import {
  API_TOKEN_COOKIE_NAME,
  readApiTokenFile,
  withBearerAuthorization,
} from "@bb/config/api-auth";

interface LocalApiSessionArgs {
  dataDir: string;
}

interface InstallLocalApiSessionCookieArgs {
  cookies: Pick<Cookies, "set">;
  serverUrl: string;
  token: string;
}

const SESSION_COOKIE_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

// The bb server writes its API token to the data dir before it starts
// listening, so any probe that reaches a live server can also read the file.
// The file is re-read per request: it is tiny, and a restarted server with a
// fresh data dir must not be locked out by a stale in-memory copy.
export function createLocalApiFetch(args: LocalApiSessionArgs): typeof fetch {
  return async (input, init) => {
    const token = await readApiTokenFile(args.dataDir);
    return fetch(
      input,
      token === null ? init : withBearerAuthorization(init, token),
    );
  };
}

export async function readLocalApiToken(
  args: LocalApiSessionArgs,
): Promise<string | null> {
  return readApiTokenFile(args.dataDir);
}

export async function installLocalApiSessionCookie(
  args: InstallLocalApiSessionCookieArgs,
): Promise<void> {
  const serverUrl = new URL(args.serverUrl);
  await args.cookies.set({
    url: serverUrl.origin,
    name: API_TOKEN_COOKIE_NAME,
    value: args.token,
    path: "/",
    httpOnly: true,
    secure: serverUrl.protocol === "https:",
    sameSite: "strict",
    expirationDate:
      Math.floor(Date.now() / 1000) + SESSION_COOKIE_LIFETIME_SECONDS,
  });
}
