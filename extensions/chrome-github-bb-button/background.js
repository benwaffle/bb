import {
  describeError,
  findPullRequestThreads,
  loadSettings,
  openThreadInBb,
} from "./bb-client.js";

async function handleMessage(message) {
  const settings = await loadSettings();
  if (settings.apiToken.length === 0) {
    return {
      ok: false,
      error: "Set the bb API token in the extension options.",
      needsSetup: true,
    };
  }
  try {
    switch (message.type) {
      case "find": {
        const threads = await findPullRequestThreads(settings, message);
        return { ok: true, threads };
      }
      case "open": {
        const result = await openThreadInBb(settings, message.thread);
        if (result.where === "browser") {
          await chrome.tabs.create({ url: result.url });
        }
        return { ok: true, where: result.where };
      }
      case "openOptions":
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      default:
        return { ok: false, error: `Unknown message type ${message.type}` };
    }
  } catch (error) {
    return { ok: false, error: describeError(error, settings) };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});
