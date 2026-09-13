const BUTTON_ID = "bb-open-thread-button";
const MENU_ID = "bb-open-thread-menu";
const PULL_REQUEST_PATH = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/u;

function pullRequestFromLocation() {
  const match = PULL_REQUEST_PATH.exec(window.location.pathname);
  if (match === null) {
    return null;
  }
  const [, owner, repo, number] = match;
  return {
    owner,
    repo,
    number,
    prUrl: `${window.location.origin}/${owner}/${repo}/pull/${number}`,
  };
}

function branchFromTreeHref(anchor) {
  const href = anchor.getAttribute("href") ?? "";
  const match = /^\/[^/]+\/[^/]+\/tree\/(.+)$/u.exec(href);
  return match === null ? null : decodeURIComponent(match[1]);
}

function headBranchAnchor() {
  const anchors = [
    ...document.querySelectorAll('a[data-component="BranchName"]'),
  ].filter((anchor) => branchFromTreeHref(anchor) !== null);
  return anchors.length >= 2 ? anchors[1] : null;
}

function readHeadBranch() {
  const anchor = headBranchAnchor();
  if (anchor !== null) {
    return branchFromTreeHref(anchor);
  }
  const headRef = document.querySelector(".head-ref");
  if (headRef === null) {
    return null;
  }
  const title =
    headRef.querySelector("a")?.getAttribute("title") ??
    headRef.getAttribute("title");
  if (title !== null && title.includes(":")) {
    return title.slice(title.indexOf(":") + 1).trim();
  }
  const text = headRef.textContent?.trim() ?? "";
  if (text.length === 0) {
    return null;
  }
  return text.includes(":") ? text.slice(text.indexOf(":") + 1).trim() : text;
}

function threadIdInBranch(branch) {
  const match = /thr_[a-z0-9]+/u.exec(branch);
  return match === null ? null : match[0];
}

function findButtonSlot() {
  const actions = document.querySelector('[data-component="PH_Actions"]');
  if (actions !== null && !actions.classList.contains("d-none")) {
    return { container: actions, position: "prepend" };
  }
  const classicActions = document.querySelector(".gh-header-actions");
  if (classicActions !== null) {
    return { container: classicActions, position: "prepend" };
  }
  const branchAnchor = headBranchAnchor();
  if (branchAnchor?.parentElement) {
    return { container: branchAnchor.parentElement, position: "append" };
  }
  return null;
}

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError !== undefined) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response ?? { ok: false, error: "No response from extension" });
    });
  });
}

function removeMenu() {
  document.getElementById(MENU_ID)?.remove();
}

function showMenu(button, entries) {
  removeMenu();
  const menu = document.createElement("div");
  menu.id = MENU_ID;
  menu.className = "bb-menu";
  for (const entry of entries) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = `bb-menu-item${entry.onSelect ? "" : " bb-menu-note"}`;
    item.textContent = entry.label;
    if (entry.detail) {
      const detail = document.createElement("span");
      detail.className = "bb-menu-detail";
      detail.textContent = entry.detail;
      item.append(detail);
    }
    if (entry.onSelect) {
      item.addEventListener("click", () => {
        removeMenu();
        entry.onSelect();
      });
    } else {
      item.disabled = true;
    }
    menu.append(item);
  }
  const rect = button.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.right = `${document.documentElement.clientWidth - rect.right - window.scrollX}px`;
  document.body.append(menu);
  const close = (event) => {
    if (!menu.contains(event.target)) {
      removeMenu();
      document.removeEventListener("mousedown", close, true);
    }
  };
  document.addEventListener("mousedown", close, true);
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle("bb-busy", busy);
}

async function openThread(button, thread) {
  setBusy(button, true);
  const response = await sendMessage({ type: "open", thread });
  setBusy(button, false);
  if (!response.ok) {
    showMenu(button, [{ label: response.error }]);
  }
}

async function onButtonClick(button) {
  const pullRequest = pullRequestFromLocation();
  if (pullRequest === null) {
    return;
  }
  const branch = readHeadBranch();
  if (branch === null) {
    showMenu(button, [{ label: "Could not read the head branch from this page." }]);
    return;
  }
  setBusy(button, true);
  const response = await sendMessage({
    type: "find",
    repo: pullRequest.repo,
    branch,
    threadId: threadIdInBranch(branch),
    prUrl: pullRequest.prUrl,
  });
  setBusy(button, false);
  if (!response.ok) {
    const entries = [{ label: response.error }];
    if (response.needsSetup) {
      entries.push({
        label: "Open extension options",
        onSelect: () => sendMessage({ type: "openOptions" }),
      });
    }
    showMenu(button, entries);
    return;
  }
  if (response.threads.length === 0) {
    showMenu(button, [{ label: `No bb thread is working on ${branch}.` }]);
    return;
  }
  if (response.threads.length === 1) {
    await openThread(button, response.threads[0]);
    return;
  }
  showMenu(
    button,
    response.threads.map((thread) => ({
      label: thread.title,
      detail: [
        thread.status,
        thread.mentionsPullRequest ? "mentions this PR" : thread.branch,
      ]
        .filter(Boolean)
        .join(" · "),
      onSelect: () => openThread(button, thread),
    })),
  );
}

function ensureButton() {
  const existing = document.getElementById(BUTTON_ID);
  if (pullRequestFromLocation() === null) {
    existing?.remove();
    removeMenu();
    return;
  }
  const slot = findButtonSlot();
  if (slot === null) {
    return;
  }
  if (existing !== null && slot.container.contains(existing)) {
    return;
  }
  existing?.remove();
  const button = document.createElement("button");
  button.id = BUTTON_ID;
  button.type = "button";
  button.className = "btn btn-sm bb-button";
  button.title = "Open the bb thread that produced this pull request";
  button.setAttribute("aria-label", "Open in bb");
  const logo = document.createElement("img");
  logo.className = "bb-logo";
  logo.src = chrome.runtime.getURL("bb-logo.svg");
  logo.alt = "";
  button.append(logo);
  button.addEventListener("click", () => void onButtonClick(button));
  if (slot.position === "prepend") {
    slot.container.prepend(button);
  } else {
    slot.container.append(button);
  }
}

let scheduled = false;
function scheduleEnsure() {
  if (scheduled) {
    return;
  }
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    ensureButton();
  });
}

ensureButton();
for (const eventName of ["turbo:load", "turbo:render", "pjax:end"]) {
  document.addEventListener(eventName, scheduleEnsure);
}
new MutationObserver(scheduleEnsure).observe(document.body, {
  childList: true,
  subtree: true,
});
