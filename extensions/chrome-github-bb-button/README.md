# bb for GitHub (Chrome extension)

Adds a **bb** button to the header of every GitHub pull request. Clicking it
opens the bb thread the pull request came from in the bb desktop app.

## How it finds the thread

1. Reads the pull request's head branch from the page.
2. Branches that bb created end in the thread id, such as
   `bb/fix-login-thr_ekk8rv4cd5`. When the head branch names a thread that
   still exists, that thread is the answer.
3. Otherwise it lists bb threads and keeps the ones whose environment is
   checked out on that branch. When threads from several repositories share
   the branch name, it prefers environments whose directory name matches the
   GitHub repository.
4. It also searches bb for the pull request URL. Threads that quoted the URL
   rank first; any such thread that is not on the branch is added to the list
   as well.

One match opens directly. Several matches show a menu. No match shows a note
naming the branch it looked for.

## Opening

Selecting a thread calls the same route as `bb thread open --focus`. When the
desktop app is connected it switches to that thread and brings its window to
the front. Otherwise the extension opens the thread in a browser tab through
the bb session link.

## Install

1. Open `chrome://extensions`, enable Developer mode, choose Load unpacked, and
   pick this directory.
2. Open the extension options and set the server URL and API token. The desktop
   app records the server URL in `~/.bb/bb-app-runtime.json`; the token is the
   contents of `~/.bb/api-token`.
3. Open any pull request on github.com.

## Server requirement

The extension authenticates with the API token as a bearer header. The bb
server skips its browser origin check for bearer-authenticated requests, which
is what lets a `chrome-extension://` origin call `/api/v1`.
