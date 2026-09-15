import { Switch } from "@bb/shared-ui/switch";
import {
  SettingsSection,
  SettingsWithControl,
} from "@/components/ui/settings-section";
import { useAudioInputDevices } from "@/hooks/useAudioInputDevices";
import { usePushToTalkPreference } from "@/lib/push-to-talk-preference";
import { MicrophonePreferences } from "./MicrophonePreferences";

export const PUSH_TO_TALK_SETTING_LABEL = "Hold Space to talk";

export function VoiceInputSettingsSection() {
  const { isSupported } = useAudioInputDevices();
  const [pushToTalkEnabled, setPushToTalkEnabled] = usePushToTalkPreference();

  return (
    <SettingsSection title="Voice Input">
      <MicrophonePreferences open={false} activeStream={null} />
      <SettingsWithControl
        label={PUSH_TO_TALK_SETTING_LABEL}
        description="Hold the space bar in an empty composer, or with nothing focused, to dictate. The transcript appears while you speak and is inserted when you release."
      >
        <Switch
          checked={pushToTalkEnabled}
          onCheckedChange={setPushToTalkEnabled}
          disabled={!isSupported}
          aria-label={PUSH_TO_TALK_SETTING_LABEL}
        />
      </SettingsWithControl>
    </SettingsSection>
  );
}
