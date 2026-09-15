import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { createLocalStorageSyncStorage } from "./browser-storage";

const PUSH_TO_TALK_STORAGE_KEY = "bb.voiceInput.pushToTalkEnabled";

export function parsePushToTalkEnabled(
  storedValue: string | null,
  initialValue: boolean,
): boolean {
  if (storedValue === "true") return true;
  if (storedValue === "false") return false;
  return initialValue;
}

const pushToTalkStorage = createLocalStorageSyncStorage<boolean>({
  parse: parsePushToTalkEnabled,
  serialize: (value) => (value ? "true" : "false"),
});

const pushToTalkEnabledAtom = atomWithStorage<boolean>(
  PUSH_TO_TALK_STORAGE_KEY,
  true,
  pushToTalkStorage,
  { getOnInit: true },
);

export function usePushToTalkPreference() {
  return useAtom(pushToTalkEnabledAtom);
}

export function usePushToTalkEnabled() {
  return useAtomValue(pushToTalkEnabledAtom);
}
