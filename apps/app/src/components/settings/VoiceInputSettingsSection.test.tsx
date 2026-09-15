// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@bb/shared-ui/tooltip";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PUSH_TO_TALK_SETTING_LABEL,
  VoiceInputSettingsSectionContent,
} from "./VoiceInputSettingsSection";

const devices = [
  { deviceId: "macbook-mic", label: "MacBook Pro Microphone" },
  { deviceId: "studio-mic", label: "Studio Display Microphone" },
];

type ContentProps = Parameters<typeof VoiceInputSettingsSectionContent>[0];

function renderContent(overrides: Partial<ContentProps> = {}) {
  return render(
    <TooltipProvider>
      <VoiceInputSettingsSectionContent
        devices={devices}
        errorMessage={null}
        isLoading={false}
        isSupported={true}
        onDeviceChange={() => undefined}
        onRefresh={() => undefined}
        preferredDeviceId={null}
        pushToTalkEnabled={true}
        onPushToTalkChange={() => undefined}
        {...overrides}
      />
    </TooltipProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe("VoiceInputSettingsSectionContent", () => {
  it("keeps the refresh action inline with the heading on mobile", () => {
    renderContent();

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
          onDeviceChange={() => undefined}
          onRefresh={() => undefined}
          preferredDeviceId="studio-mic"
          pushToTalkEnabled={true}
          onPushToTalkChange={() => undefined}
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
        "Preferred microphone is disconnected. Using the system default until it reconnects.",
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

  it.each([
    ["Microphone permission denied", "Microphone permission denied"],
    ["No microphones found", "No microphones found"],
  ])(
    "distinguishes an empty list from an access error: %s",
    (errorMessage, message) => {
      render(
        <TooltipProvider>
          <VoiceInputSettingsSectionContent
            devices={[]}
            errorMessage={errorMessage}
            isLoading={false}
            isSupported={true}
            onDeviceChange={() => undefined}
            onRefresh={() => undefined}
            preferredDeviceId={null}
            pushToTalkEnabled={true}
            onPushToTalkChange={() => undefined}
          />
        </TooltipProvider>,
      );
      expect(screen.getByText(message)).toBeDefined();
    },
  );

  it("checks microphone access from the inline action", () => {
    const onRefresh = vi.fn();
    render(
      <TooltipProvider>
        <VoiceInputSettingsSectionContent
          devices={[]}
          errorMessage={null}
          isLoading={false}
          isSupported={true}
          onDeviceChange={() => undefined}
          onRefresh={onRefresh}
          preferredDeviceId={null}
          pushToTalkEnabled={true}
          onPushToTalkChange={() => undefined}
        />
      </TooltipProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Check microphone access" }),
    );
    expect(onRefresh).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("toggles push-to-talk and disables the switch without microphone support", () => {
    const onPushToTalkChange = vi.fn();
    renderContent({ pushToTalkEnabled: true, onPushToTalkChange });

    const toggle = screen.getByRole("switch", {
      name: PUSH_TO_TALK_SETTING_LABEL,
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onPushToTalkChange).toHaveBeenCalledWith(false);

    cleanup();
    renderContent({ isSupported: false });
    expect(
      screen.getByRole("switch", { name: PUSH_TO_TALK_SETTING_LABEL }),
    ).toHaveProperty("disabled", true);
  });
});
