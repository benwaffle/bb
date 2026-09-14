import {
  createFakePluginHost,
  makeHostResponse,
} from "@get-bb/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import plugin from "./server.js";

type FakePluginHostOptions = NonNullable<
  Parameters<typeof createFakePluginHost>[0]
>;
type HostRpcResponder = NonNullable<
  FakePluginHostOptions["experimental_callHostRpc"]
>;

const STATUS = {
  whisperCli: "/opt/homebrew/bin/whisper-cli",
  ffmpeg: "/opt/homebrew/bin/ffmpeg",
  modelDir: "/data/models",
  models: [
    {
      name: "base.en",
      path: "/data/models/ggml-base.en.bin",
      sizeBytes: 148 * 1024 * 1024,
    },
  ],
};

function createHost(args: {
  transcription: string;
  primaryHostId: string | null;
  hosts: ReturnType<typeof makeHostResponse>[];
  respond: HostRpcResponder;
}) {
  return createFakePluginHost({
    pluginId: "voice-whisper-local",
    sdk: {
      hosts: { list: async () => args.hosts },
      system: {
        config: async () =>
          ({
            primaryHostId: args.primaryHostId,
            aiServices: { transcription: args.transcription },
          }) as never,
      },
    },
    experimental_callHostRpc: args.respond,
  });
}

describe("whisper server entry", () => {
  it("registers the whisper voice service", async () => {
    const host = createHost({
      transcription: "codex/gpt-transcribe",
      primaryHostId: null,
      hosts: [],
      respond: () => STATUS,
    });
    await plugin(host.bb);

    expect(host.harness.registrations.aiServiceRegistrations).toMatchObject([
      { id: "whisper", kinds: ["voice"] },
    ]);
  });

  it("shows status for the primary host and how to switch voice input to whisper", async () => {
    const host = createHost({
      transcription: "codex/gpt-transcribe",
      primaryHostId: "host-primary",
      hosts: [
        makeHostResponse({
          id: "host-other",
          name: "laptop",
          status: "connected",
        }),
        makeHostResponse({
          id: "host-primary",
          name: "studio",
          status: "connected",
        }),
      ],
      respond: ({ method }) => {
        expect(method).toBe("status");
        return STATUS;
      },
    });
    await plugin(host.bb);

    const result = await host.harness.runCli(["status"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Host: studio (host-primary)");
    expect(result.stdout).toContain("base.en (148 MB)");
    expect(result.stdout).toContain(
      "bb-app config set BB_TRANSCRIPTION whisper/base.en",
    );
    expect(host.harness.experimental_hostRpcCalls).toMatchObject([
      { method: "status", hostId: "host-primary" },
    ]);
  });

  it("targets an explicit --host by name and emits JSON", async () => {
    const host = createHost({
      transcription: "whisper/base.en",
      primaryHostId: "host-primary",
      hosts: [
        makeHostResponse({
          id: "host-other",
          name: "laptop",
          status: "connected",
        }),
        makeHostResponse({
          id: "host-primary",
          name: "studio",
          status: "connected",
        }),
      ],
      respond: () => STATUS,
    });
    await plugin(host.bb);

    const result = await host.harness.runCli([
      "status",
      "--host",
      "laptop",
      "--json",
    ]);

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout ?? "")).toMatchObject({
      host: { id: "host-other", name: "laptop" },
      transcription: "whisper/base.en",
      models: [{ name: "base.en" }],
    });
  });

  it("downloads a model with a long-running host call", async () => {
    const host = createHost({
      transcription: "codex/gpt-transcribe",
      primaryHostId: "host-primary",
      hosts: [
        makeHostResponse({
          id: "host-primary",
          name: "studio",
          status: "connected",
        }),
      ],
      respond: ({ method, input }) => {
        expect(method).toBe("prepareModel");
        expect(input).toEqual({ model: "small.en" });
        return {
          model: {
            name: "small.en",
            path: "/data/models/ggml-small.en.bin",
            sizeBytes: 488 * 1024 * 1024,
          },
          downloaded: true,
          warmupMs: 17_800,
        };
      },
    });
    await plugin(host.bb);

    const result = await host.harness.runCli(["prepare", "small.en"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Downloaded small.en (488 MB)");
    expect(result.stdout).toContain("17.8s");
    expect(result.stdout).toContain(
      "bb-app config set BB_TRANSCRIPTION whisper/small.en",
    );
    expect(host.harness.experimental_hostRpcCalls).toMatchObject([
      { method: "prepareModel", hostId: "host-primary" },
    ]);
  });

  it("rejects bad model names, unknown hosts, and unknown flags without calling the host", async () => {
    const host = createHost({
      transcription: "codex/gpt-transcribe",
      primaryHostId: "host-primary",
      hosts: [
        makeHostResponse({
          id: "host-primary",
          name: "studio",
          status: "connected",
        }),
      ],
      respond: () => STATUS,
    });
    await plugin(host.bb);

    const badModel = await host.harness.runCli(["prepare", "../etc/passwd"]);
    expect(badModel.exitCode).toBe(1);
    expect(badModel.stderr).toContain("Model names use");

    const badHost = await host.harness.runCli(["status", "--host", "nope"]);
    expect(badHost.exitCode).toBe(1);
    expect(badHost.stderr).toContain('No machine matches "nope"');

    const badFlag = await host.harness.runCli(["status", "--verbose"]);
    expect(badFlag.exitCode).toBe(1);
    expect(badFlag.stderr).toContain("Unknown flag --verbose");

    expect(host.harness.experimental_hostRpcCalls).toEqual([]);
  });

  it("asks for --host when no primary host is known and several machines are connected", async () => {
    const host = createHost({
      transcription: "codex/gpt-transcribe",
      primaryHostId: null,
      hosts: [
        makeHostResponse({ id: "a", name: "alpha", status: "connected" }),
        makeHostResponse({ id: "b", name: "beta", status: "connected" }),
      ],
      respond: () => STATUS,
    });
    await plugin(host.bb);

    const result = await host.harness.runCli(["status"]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("alpha, beta");
  });
});
