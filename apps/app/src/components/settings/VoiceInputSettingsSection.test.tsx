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

  it("keeps a stale selected microphone visible as unavailable", () => {
    renderContent({ preferredDeviceId: "missing-mic" });

    expect(screen.getByText("Unavailable microphone")).toBeDefined();
    expect(
      screen.getByText("Selected microphone is unavailable."),
    ).toBeDefined();
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
