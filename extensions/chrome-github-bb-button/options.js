import {
  describeError,
  loadSettings,
  saveSettings,
  testConnection,
} from "./bb-client.js";

const form = document.getElementById("form");
const serverUrlEl = document.getElementById("serverUrl");
const apiTokenEl = document.getElementById("apiToken");
const statusEl = document.getElementById("status");

function setStatus(message, { error = false } = {}) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", error);
}

async function restore() {
  const settings = await loadSettings();
  serverUrlEl.value = settings.serverUrl;
  apiTokenEl.value = settings.apiToken;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await saveSettings({
    serverUrl: serverUrlEl.value,
    apiToken: apiTokenEl.value,
  });
  const settings = await loadSettings();
  serverUrlEl.value = settings.serverUrl;
  if (settings.apiToken.length === 0) {
    setStatus("Saved, but the API token is empty.", { error: true });
    return;
  }
  setStatus("Saved. Testing connection…");
  try {
    const count = await testConnection(settings);
    setStatus(`Connected to bb. ${count.total} threads visible.`);
  } catch (error) {
    setStatus(describeError(error, settings), { error: true });
  }
});

void restore();
