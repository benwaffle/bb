import { describe, expect, it } from "vitest";
import { API_TOKEN_COOKIE_NAME } from "@bb/config/api-auth";
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
});
