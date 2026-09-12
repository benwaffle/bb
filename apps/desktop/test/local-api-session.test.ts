import { describe, expect, it } from "vitest";
import { externalUrlWithLocalApiSession } from "../src/local-api-session.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const LOCAL_SERVER_URL = "http://127.0.0.1:38886";

describe("externalUrlWithLocalApiSession", () => {
  it("routes local server links through the session endpoint", () => {
    const opened = new URL(
      externalUrlWithLocalApiSession({
        localServerUrl: LOCAL_SERVER_URL,
        token: TOKEN,
        url: `${LOCAL_SERVER_URL}/api/v1/threads/thr_1/thread-storage/files/reports/a%20b.html?download=1&v=2#top`,
      }),
    );
    expect(opened.origin).toBe(LOCAL_SERVER_URL);
    expect(opened.pathname).toBe("/auth/session");
    expect(opened.searchParams.get("token")).toBe(TOKEN);
    expect(opened.searchParams.get("next")).toBe(
      "/api/v1/threads/thr_1/thread-storage/files/reports/a%20b.html?download=1&v=2#top",
    );
  });

  it.each([
    ["another origin", "http://127.0.0.1:9999/api/v1/system/config"],
    [
      "a different loopback name",
      "http://localhost:38886/api/v1/system/config",
    ],
    ["a public site", "https://example.com/api/v1/system/config"],
    ["a mailto link", "mailto:hi@example.com"],
    ["an existing session link", `${LOCAL_SERVER_URL}/auth/session?token=x`],
  ])("leaves %s unchanged", (_label, url) => {
    expect(
      externalUrlWithLocalApiSession({
        localServerUrl: LOCAL_SERVER_URL,
        token: TOKEN,
        url,
      }),
    ).toBe(url);
  });

  it("leaves links unchanged without a local server or token", () => {
    const url = `${LOCAL_SERVER_URL}/api/v1/system/config`;
    expect(
      externalUrlWithLocalApiSession({
        localServerUrl: null,
        token: TOKEN,
        url,
      }),
    ).toBe(url);
    expect(
      externalUrlWithLocalApiSession({
        localServerUrl: LOCAL_SERVER_URL,
        token: null,
        url,
      }),
    ).toBe(url);
  });
});
