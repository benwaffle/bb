import { describe, expect, it, vi } from "vitest";
import { API_TOKEN_COOKIE_NAME } from "@bb/config/api-auth";
import { defaultAppSettings } from "@bb/domain";
import { setAppSettings } from "@bb/db";
import { registerHostRpcResponder } from "../helpers/host-rpc.js";
import { seedThread, seedThreadFixture } from "../helpers/seed.js";
import {
  createTestAppHarness,
  type TestAppHarness,
} from "../helpers/test-app.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const SESSION_COOKIE = `${API_TOKEN_COOKIE_NAME}=${TOKEN}`;

async function createFilePreviewFixture() {
  const harness = await createTestAppHarness({ apiToken: TOKEN });
  const { host, session, project, environment, thread } =
    seedThreadFixture(harness);
  const storageThread = seedThread(harness.deps, {
    projectId: project.id,
    environmentId: environment.id,
  });
  const storageRoot = `/tmp/bb-host-data/${host.id}/thread-storage/${storageThread.id}`;
  const files = new Map([
    ["/Users/me/showcase/showcase.html", "text/html"],
    ["/Users/me/showcase/inner.html", "text/html"],
    ["/Users/me/showcase/assets/chart.png", "image/png"],
    ["/Users/me/secrets.js", "text/javascript"],
    [`${storageRoot}/showcase/inner.html`, "text/html"],
  ]);
  registerHostRpcResponder(harness, {
    hostId: host.id,
    sessionId: session.id,
    handle: ({ command }) => {
      const mimeType =
        command.type === "host.read_file_chunk"
          ? files.get(command.path)
          : undefined;
      if (command.type !== "host.read_file_chunk" || mimeType === undefined) {
        return { ok: false, errorCode: "ENOENT", errorMessage: "missing" };
      }
      const bytes = Buffer.from(`<p>${command.path}</p>`);
      return {
        ok: true,
        result: {
          path: command.path,
          content: bytes
            .subarray(command.offset, command.offset + command.length)
            .toString("base64"),
          offset: command.offset,
          mimeType,
          modifiedAtMs: 1234,
          sizeBytes: bytes.length,
          revision: "0".repeat(64),
        },
      };
    },
  });
  const hostFiles = `/api/v1/threads/${thread.id}/host-files/Users/me`;
  return {
    harness,
    hostFiles,
    outerUrl: `${hostFiles}/showcase/showcase.html`,
    storageFile: `/api/v1/threads/${storageThread.id}/thread-storage/files/showcase/inner.html`,
    storageThreadId: storageThread.id,
  };
}

async function requestStatus(
  harness: TestAppHarness,
  url: string,
  init: { cookie: string; method?: string; origin?: string },
): Promise<number> {
  const response = await harness.app.request(url, {
    method: init.method ?? "GET",
    headers: {
      cookie: init.cookie,
      ...(init.origin !== undefined ? { origin: init.origin } : {}),
    },
  });
  await response.arrayBuffer();
  return response.status;
}

async function issueFileReadCookies(
  harness: TestAppHarness,
  url: string,
): Promise<{ cookie: string; setCookies: string[] }> {
  const response = await harness.app.request(url, {
    headers: { cookie: SESSION_COOKIE },
  });
  expect(response.status).toBe(200);
  await response.arrayBuffer();
  const setCookies = response.headers.getSetCookie();
  return {
    cookie: setCookies.map((value) => value.split(";")[0]).join("; "),
    setCookies,
  };
}

describe("local API token", () => {
  it("rejects /api/v1 requests without the token", async () => {
    const harness = await createTestAppHarness({ apiToken: TOKEN });
    try {
      const response = await harness.app.request("/api/v1/system/config");
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: "unauthorized" });
    } finally {
      await harness.cleanup();
    }
  });

  it("accepts the token as a bearer header or as the session cookie", async () => {
    const harness = await createTestAppHarness({ apiToken: TOKEN });
    try {
      const bearer = await harness.app.request("/api/v1/system/config", {
        headers: { authorization: `Bearer ${TOKEN}` },
      });
      expect(bearer.status).toBe(200);
      const cookie = await harness.app.request("/api/v1/system/config", {
        headers: { cookie: `other=1; ${API_TOKEN_COOKIE_NAME}=${TOKEN}` },
      });
      expect(cookie.status).toBe(200);
      const wrong = await harness.app.request("/api/v1/system/config", {
        headers: { authorization: "Bearer not-the-token" },
      });
      expect(wrong.status).toBe(401);
    } finally {
      await harness.cleanup();
    }
  });

  it("exchanges a valid session token for an HttpOnly cookie and redirects", async () => {
    const harness = await createTestAppHarness({ apiToken: TOKEN });
    try {
      const response = await harness.app.request(
        `/auth/session?token=${TOKEN}&next=/threads/abc`,
        { redirect: "manual" },
      );
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/threads/abc");
      const setCookie = response.headers.get("set-cookie") ?? "";
      expect(setCookie).toContain(`${API_TOKEN_COOKIE_NAME}=${TOKEN}`);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");

      const openRedirect = await harness.app.request(
        `/auth/session?token=${TOKEN}&next=//evil.example/`,
        { redirect: "manual" },
      );
      expect(openRedirect.headers.get("location")).toBe("/");

      const rejected = await harness.app.request("/auth/session?token=nope", {
        redirect: "manual",
      });
      expect(rejected.status).toBe(403);
      expect(rejected.headers.get("set-cookie")).toBeNull();
    } finally {
      await harness.cleanup();
    }
  });

  it("redirects a session link to an API file path without the token", async () => {
    const harness = await createTestAppHarness({ apiToken: TOKEN });
    try {
      const next =
        "/api/v1/threads/thr_1/thread-storage/files/reports/a%20b.html?download=1&v=2";
      const response = await harness.app.request(
        `/auth/session?token=${TOKEN}&next=${encodeURIComponent(next)}`,
        { redirect: "manual" },
      );
      expect(response.status).toBe(303);
      const location = response.headers.get("location") ?? "";
      expect(location).toBe(next);
      expect(location).not.toContain(TOKEN);
      const cookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
      const followed = await harness.app.request("/api/v1/system/config", {
        headers: { cookie },
      });
      expect(followed.status).toBe(200);
    } finally {
      await harness.cleanup();
    }
  });

  it("refuses foreign Host headers when bound to loopback", async () => {
    const harness = await createTestAppHarness({
      apiToken: TOKEN,
      restrictHostHeaderToLoopback: true,
    });
    try {
      const rebound = await harness.app.request(
        "http://attacker.example:3334/api/v1/system/config",
        {
          headers: {
            authorization: `Bearer ${TOKEN}`,
            host: "attacker.example:3334",
          },
        },
      );
      expect(rebound.status).toBe(403);
      const lanAddress = await harness.app.request(
        "http://192.168.1.5:3334/api/v1/system/config",
        {
          headers: {
            authorization: `Bearer ${TOKEN}`,
            host: "192.168.1.5:3334",
          },
        },
      );
      expect(lanAddress.status).toBe(421);
      for (const host of ["localhost:3334", "127.0.0.1:3334", "[::1]:3334"]) {
        const local = await harness.app.request(
          `http://${host}/api/v1/system/config`,
          { headers: { authorization: `Bearer ${TOKEN}`, host } },
        );
        expect(local.status, host).toBe(200);
      }
    } finally {
      await harness.cleanup();
    }
  });

  it("accepts the machineServerUrl hostname when bound to loopback", async () => {
    const harness = await createTestAppHarness({
      apiToken: TOKEN,
      restrictHostHeaderToLoopback: true,
    });
    const request = (host: string, headers: Record<string, string> = {}) =>
      harness.app.request(`https://${host}/api/v1/system/config`, {
        headers: { authorization: `Bearer ${TOKEN}`, host, ...headers },
      });
    try {
      const tailnetHost = "box.tail1234.ts.net";
      expect((await request(tailnetHost)).status).toBe(403);
      setAppSettings(harness.db, {
        ...defaultAppSettings,
        machineServerUrl: `https://${tailnetHost}`,
      });
      expect((await request(tailnetHost)).status).toBe(200);
      expect(
        (
          await request(tailnetHost, {
            origin: "chrome-extension://abcdefghijklmnop",
          })
        ).status,
      ).toBe(200);
      expect((await request("attacker.example")).status).toBe(403);
    } finally {
      await harness.cleanup();
    }
  });

  it("serves server-machine-only internal routes to a loopback Host or the API token", async () => {
    const harness = await createTestAppHarness({
      apiToken: TOKEN,
      restrictHostHeaderToLoopback: true,
    });
    const tailnetHost = "box.tail1234.ts.net";
    setAppSettings(harness.db, {
      ...defaultAppSettings,
      machineServerUrl: `https://${tailnetHost}`,
    });
    const proxiedFromLoopback = {
      incoming: { socket: { remoteAddress: "127.0.0.1" } },
    };
    const request = (
      path: string,
      host: string,
      init: { method: string; authorization?: string },
    ) =>
      harness.app.request(
        `http://${host}${path}`,
        {
          method: init.method,
          headers: {
            host,
            "content-type": "application/json",
            ...(init.authorization
              ? { authorization: init.authorization }
              : {}),
          },
          ...(init.method === "POST" ? { body: "{}" } : {}),
        },
        proxiedFromLoopback,
      );
    try {
      const enrollKey = "/internal/hosts/enroll-key";
      const tailnet = await request(enrollKey, tailnetHost, { method: "POST" });
      expect(tailnet.status).toBe(400);
      expect(await tailnet.json()).toMatchObject({ code: "unsupported_host" });
      expect(
        (await request(enrollKey, "127.0.0.1:3334", { method: "POST" })).status,
      ).toBe(201);
      expect(
        (
          await request(enrollKey, tailnetHost, {
            method: "POST",
            authorization: `Bearer ${TOKEN}`,
          })
        ).status,
      ).toBe(201);

      const pending = "/internal/server-move/pending";
      const tailnetPending = await request(pending, tailnetHost, {
        method: "GET",
      });
      expect(tailnetPending.status).toBe(403);
      expect(await tailnetPending.json()).toMatchObject({
        code: "loopback_only",
      });
      for (const response of [
        await request(pending, "localhost:3334", { method: "GET" }),
        await request(pending, tailnetHost, {
          method: "GET",
          authorization: `Bearer ${TOKEN}`,
        }),
      ]) {
        expect(await response.json()).toMatchObject({
          code: "server_move_not_pending",
        });
      }
    } finally {
      await harness.cleanup();
    }
  });
});

describe("HTML preview file-read cookies", () => {
  it("issues storage- and directory-scoped cookies with a previewed HTML file", async () => {
    const fixture = await createFilePreviewFixture();
    try {
      const { setCookies } = await issueFileReadCookies(
        fixture.harness,
        fixture.outerUrl,
      );
      const attributes = setCookies.map((value) =>
        value.split("; ").slice(1).sort(),
      );
      expect(
        setCookies.every((value) => value.startsWith("bb_file_read=")),
      ).toBe(true);
      expect(attributes).toEqual([
        [
          "HttpOnly",
          "Max-Age=600",
          "Path=/api/v1/threads/",
          "SameSite=None",
          "Secure",
        ],
        [
          "HttpOnly",
          "Max-Age=600",
          `Path=${fixture.hostFiles}/showcase/`,
          "SameSite=None",
          "Secure",
        ],
      ]);
      expect(setCookies.join("\n")).not.toContain(TOKEN);

      const image = await fixture.harness.app.request(
        `${fixture.hostFiles}/showcase/assets/chart.png`,
        { headers: { cookie: SESSION_COOKIE } },
      );
      expect(image.status).toBe(200);
      expect(image.headers.getSetCookie()).toEqual([]);

      const storagePreview = await issueFileReadCookies(
        fixture.harness,
        fixture.storageFile,
      );
      expect(storagePreview.setCookies).toHaveLength(1);
      expect(storagePreview.setCookies[0]).toContain("Path=/api/v1/threads/");
    } finally {
      await fixture.harness.cleanup();
    }
  });

  it("authorizes only GET reads of thread storage and the preview directory", async () => {
    const fixture = await createFilePreviewFixture();
    const { harness, hostFiles } = fixture;
    try {
      const { cookie } = await issueFileReadCookies(harness, fixture.outerUrl);
      const nested = await harness.app.request(fixture.storageFile, {
        headers: { cookie },
      });
      expect(nested.status).toBe(200);
      await expect(nested.text()).resolves.toContain("showcase/inner.html");
      expect(nested.headers.getSetCookie()).toEqual([]);

      for (const url of [
        `${hostFiles}/showcase/inner.html`,
        `${hostFiles}/showcase/assets/chart.png`,
      ]) {
        expect(await requestStatus(harness, url, { cookie }), url).toBe(200);
      }
      expect(
        await requestStatus(harness, fixture.storageFile, {
          cookie,
          method: "HEAD",
        }),
      ).toBe(200);

      for (const url of [
        `${hostFiles}/secrets.js`,
        `/api/v1/threads/${fixture.storageThreadId}/thread-storage/files`,
        `/api/v1/threads/${fixture.storageThreadId}`,
        "/api/v1/system/config",
      ]) {
        expect(await requestStatus(harness, url, { cookie }), url).toBe(401);
      }
      expect(
        await requestStatus(harness, "/api/v1/files/read", {
          cookie,
          method: "POST",
        }),
      ).toBe(401);
      expect(
        await requestStatus(harness, fixture.storageFile, {
          cookie,
          origin: "null",
        }),
      ).toBe(403);

      const [storageCookie] = cookie.split("; ");
      const [expires, scope, signature] = storageCookie
        .slice("bb_file_read=".length)
        .split(".");
      const forged = [
        `bb_file_read=${expires}.${scope}.${signature.slice(1)}A`,
        `bb_file_read=${Number(expires) + 3600}.${scope}.${signature}`,
        `bb_file_read=${expires}.d${Buffer.from(`${hostFiles}/`).toString("base64url")}.${signature}`,
      ];
      for (const forgedCookie of forged) {
        expect(
          await requestStatus(harness, `${hostFiles}/secrets.js`, {
            cookie: forgedCookie,
          }),
          forgedCookie,
        ).toBe(401);
        expect(
          await requestStatus(harness, fixture.storageFile, {
            cookie: forgedCookie,
          }),
          forgedCookie,
        ).toBe(401);
      }
    } finally {
      await harness.cleanup();
    }
  });

  it("stops authorizing reads once the cookie expires", async () => {
    const fixture = await createFilePreviewFixture();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-10-05T12:00:00Z"));
      const { cookie } = await issueFileReadCookies(
        fixture.harness,
        fixture.outerUrl,
      );
      vi.setSystemTime(new Date("2026-10-05T12:09:59Z"));
      expect(
        await requestStatus(fixture.harness, fixture.storageFile, { cookie }),
      ).toBe(200);
      vi.setSystemTime(new Date("2026-10-05T12:10:00Z"));
      expect(
        await requestStatus(fixture.harness, fixture.storageFile, { cookie }),
      ).toBe(401);
    } finally {
      vi.useRealTimers();
      await fixture.harness.cleanup();
    }
  });
});
