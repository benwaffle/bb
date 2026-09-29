import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { API_TOKEN_COOKIE_NAME } from "@bb/config/api-auth";
import { defaultAppSettings } from "@bb/domain";
import { readJson } from "../helpers/json.js";
import {
  createTestAppHarness,
  type TestAppHarness,
} from "../helpers/test-app.js";

const TOKEN = "0123456789abcdef0123456789abcdef";
const CLI_HINT =
  "Plugin updates are applied from the CLI after review: bb plugin update demo";

async function updateRequest(
  harness: TestAppHarness,
  auth: "cookie" | "bearer",
): Promise<Response> {
  return await harness.app.request("/api/v1/plugins/demo/update", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth === "cookie"
        ? { cookie: `${API_TOKEN_COOKIE_NAME}=${TOKEN}` }
        : { authorization: `Bearer ${TOKEN}` }),
    },
    body: "{}",
  });
}

describe("plugin updates from the app UI", () => {
  let harness: TestAppHarness;

  beforeEach(async () => {
    harness = await createTestAppHarness({ apiToken: TOKEN });
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it("rejects a cookie-authenticated update and points at the CLI by default", async () => {
    const response = await updateRequest(harness, "cookie");
    expect(response.status).toBe(403);
    expect(await readJson(response)).toEqual({ error: CLI_HINT });
  });

  it("lets a bearer-authenticated update reach the plugin service", async () => {
    const response = await updateRequest(harness, "bearer");
    expect(response.status).toBe(422);
    expect(await readJson(response)).not.toEqual({ error: CLI_HINT });
  });

  it("lets a cookie-authenticated update through once pluginUpdatesFromUi is on", async () => {
    const put = await harness.app.request("/api/v1/settings/general", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        ...defaultAppSettings,
        pluginUpdatesFromUi: true,
      }),
    });
    expect(put.status).toBe(200);

    const response = await updateRequest(harness, "cookie");
    expect(response.status).toBe(422);
    expect(await readJson(response)).not.toEqual({ error: CLI_HINT });
  });
});
