import { describe, expect, it } from "vitest";
import { API_TOKEN_COOKIE_NAME } from "@bb/config/api-auth";
import { defaultAppSettings } from "@bb/domain";
import { setAppSettings } from "@bb/db";
import { createTestAppHarness } from "../helpers/test-app.js";

const TOKEN = "0123456789abcdef0123456789abcdef";

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
      expect(rebound.status).toBe(421);
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
    const request = (host: string) =>
      harness.app.request(`https://${host}/api/v1/system/config`, {
        headers: { authorization: `Bearer ${TOKEN}`, host },
      });
    try {
      const tailnetHost = "box.tail1234.ts.net";
      expect((await request(tailnetHost)).status).toBe(421);
      setAppSettings(harness.db, {
        ...defaultAppSettings,
        machineServerUrl: `https://${tailnetHost}`,
      });
      expect((await request(tailnetHost)).status).toBe(200);
      expect((await request("attacker.example")).status).toBe(421);
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
