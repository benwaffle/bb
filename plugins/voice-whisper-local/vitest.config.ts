import { defineWorkspaceTestConfig } from "../../vitest.shared.js";

export default defineWorkspaceTestConfig({
  test: {
    name: "bb-plugin-voice-whisper-local",
    include: ["**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
