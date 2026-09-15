// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Provider, createStore } from "jotai";
import {
  PUSH_TO_TALK_SETTING_LABEL,
  VoiceInputSettingsSection,
  VoiceInputSettingsSectionContent,
} from "./VoiceInputSettingsSection";

const devices = [
  { deviceId: "macbook-mic", label: "MacBook Pro Microphone" },
  { deviceId: "studio-mic", label: "Studio Display Microphone" },
];

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("VoiceInputSettingsSectionContent", () => {
  it("keeps the refresh action inline with the heading on mobile", () => {
    render(
      <TooltipProvider>
        <VoiceInputSettingsSectionContent
          devices={devices}
          errorMessage={null}
          isLoading={false}
          isSupported={true}
          onPushToTalkEnabledChange={() => undefined}
          onRefresh={() => undefined}
          preferredDeviceId={null}
          pushToTalkEnabled={true}
        />
      </TooltipProvider>,
    );

    const refreshAction = screen.getByRole("button", {
      name: "Load microphones",
    });
    const sectionHeader = refreshAction.parentElement?.parentElement;
    expect(sectionHeader?.classList.contains("flex-row")).toBe(true);
    expect(sectionHeader?.classList.contains("flex-col")).toBe(false);
  });

  it("falls back when the preferred microphone disconnects and restores it on reconnect", () => {
    const content = (availableDevices: typeof devices) => (
      <TooltipProvider>
        <VoiceInputSettingsSectionContent
          devices={availableDevices}
          errorMessage={null}
          isLoading={false}
          isSupported={true}
          onPushToTalkEnabledChange={() => undefined}
          onRefresh={() => undefined}
          preferredDeviceId="studio-mic"
          pushToTalkEnabled={true}
        />
      </TooltipProvider>
    );
    const { rerender } = render(content(devices));
    expect(screen.getByRole("button", { name: "Microphone" }).textContent).toBe(
      "Studio Display Microphone",
    );

    rerender(
      content(devices.filter((device) => device.deviceId !== "studio-mic")),
    );
    expect(screen.getByRole("button", { name: "Microphone" }).textContent).toBe(
      "System default",
    );
    expect(
      screen.getByText(
        "Preferred microphone is disconnected. Using another input until it reconnects.",
      ),
    ).toBeDefined();

    rerender(content([]));
    expect(
      screen.getByRole("button", { name: "Check microphone access" }),
    ).toBeDefined();

    rerender(content(devices));
    expect(screen.getByRole("button", { name: "Microphone" }).textContent).toBe(
      "Studio Display Microphone",
    );
  });

  it("shows the device error it is given when no microphone is listed", () => {
    render(
      <TooltipProvider>
        <VoiceInputSettingsSectionContent
          devices={[]}
          errorMessage="Microphone permission denied"
          isLoading={false}
          isSupported={true}
          onPushToTalkEnabledChange={() => undefined}
          onRefresh={() => undefined}
          preferredDeviceId={null}
          pushToTalkEnabled={true}
        />
      </TooltipProvider>,
    );
    expect(screen.getByText("Microphone permission denied")).toBeDefined();
  });

  it("checks microphone access from the inline action", () => {
    const onRefresh = vi.fn();
    render(
      <TooltipProvider>
        <VoiceInputSettingsSectionContent
          devices={[]}
          errorMessage={null}
          isLoading={false}
          isSupported={true}
          onPushToTalkEnabledChange={() => undefined}
          onRefresh={onRefresh}
          preferredDeviceId={null}
          pushToTalkEnabled={true}
        />
      </TooltipProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Check microphone access" }),
    );
    expect(onRefresh).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("toggles push-to-talk and disables the switch without microphone support", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: Object.assign(new EventTarget(), {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      }),
    });
    render(
      <Provider store={createStore()}>
        <TooltipProvider>
          <VoiceInputSettingsSection />
        </TooltipProvider>
      </Provider>,
    );
    const toggle = await screen.findByRole("switch", {
      name: PUSH_TO_TALK_SETTING_LABEL,
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(window.localStorage.getItem("bb.voiceInput.pushToTalkEnabled")).toBe(
      "false",
    );

    cleanup();
    vi.stubGlobal("navigator", {});
    render(
      <Provider store={createStore()}>
        <TooltipProvider>
          <VoiceInputSettingsSection />
        </TooltipProvider>
      </Provider>,
    );
    expect(
      screen.getByRole("switch", { name: PUSH_TO_TALK_SETTING_LABEL }),
    ).toHaveProperty("disabled", true);
  });
});
