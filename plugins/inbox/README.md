# Inbox

The Inbox plugin draws bb's sidebar thread list as an inbox, after T3 Code's
sidebar. It registers the `inbox` thread list (`bb--inbox/inbox`). Placement
comes from the live thread view plus one stored record per settled or snoozed
thread.

## Sections

Pinned and Inbox have sticky headers with a thread count; the shelves'
headers toggle them and show their counts. Counts are the rows each section
shows; a parent's children are behind its "N children" toggle. While every
shelf is collapsed, the shelf headers stay pinned at the bottom of the list.

| Section | Shows | Order |
| ------- | ----- | ----- |
| Pinned | Pinned threads, whatever their status | Manual pin order, then pin time |
| Inbox | Every thread that is not working, pinned or parked, read or unread, with its status glyph | Newest return first |
| Working | Threads whose agent turn is running (shelf, collapsed by default) | Newest work first |
| Snoozed | Snoozed threads, with the time until they wake (shelf, collapsed) | Soonest wake first |
| Settled | Threads you settled (shelf, collapsed) | Newest settle first |

Archived and hidden threads do not show. The return time is the thread's
`latestAttentionAt`, or the moment the list saw it stop working, whichever is
later.

Opening or reading a thread never moves it: an idle thread stays in Inbox
until you settle or snooze it, as in T3 Code. Its glyph changes from the
green "Done" dot to the time since it came back.

## Status

Each row gets one status, in this order:

| Status | When | Glyph |
| ------ | ---- | ----- |
| approval | A pending interaction that asks for an approval | amber "Approval" |
| input | Any other pending interaction, such as a question | indigo "Input" |
| working | The agent turn is running | blue spinning "Working" and its duration |
| failed | `status` is `error`, a queued message failed, or the indicator is `unread-error` | red "Failed" |
| background | A background command is running | blue terminal "Background" and its duration |
| done | Idle and unread | green "Done" |
| idle | Idle and read | the time since it came back |

The pending interaction kind comes from the plugin's `pendingInteractionKinds`
RPC, which reads `bb.sdk.threads.interactions.list`. The sidebar view only
says that something is pending.

### What counts as working

Two statuses put a thread in Working:

- **working**: the agent turn runs. `status` is `starting`, `active` or
  `stopping`, or `runtimeStatus` is `starting`, `active`, `stopping` or
  `provisioning`. A turn that waits on a command it started (a `sleep`, a
  test run) is still this status.
- **background**: the turn has ended but a background command still runs,
  such as a dev server or a file watcher. The row draws a terminal glyph instead of the turn
  spinner, so "turn active" and "background job running" look different.
  Background commands on archived threads are ignored, because bb can keep
  phantom command rows for them (get-bb/bb#6123).

An approval, a question or a failure outranks background work. Background
agents, workflows, plan mode and goals reported while the thread is idle do
not count. When the last command ends the thread leaves Working, after the
grace below, and lands in Inbox, sorted by the moment it stopped.

### The 2-second grace

A thread that stops working, or whose last background command ends, stays
in Working for 2 seconds before it joins the inbox. This covers a turn that
ends just before its follow-up starts. The grace ends at once when the thread
becomes actionable (approval, input, failed) or is pinned.

## Children and groups

- A child thread nests under its parent, collapsed behind an "N children"
  toggle, unless it belongs somewhere louder: a child in Inbox that needs you
  (unread, input, approval, failed, or woken from a snooze) leaves a parent
  that is not in Inbox, a working child leaves a parent in Snoozed or
  Settled, and a pinned child goes to Pinned. A read idle child stays with
  its parent. A child shown apart has a fork glyph and
  "from <parent>".
- `experimental_sidebarThreadGroups` groups with two or more threads, or with
  placeholder rows, render as one group in the most urgent section among their
  threads (Inbox, then Working, then Pinned). Pinned and detached threads stay
  out of groups.

## Project icons

The server reads each project's `gitRemoteUrl`. A GitHub remote uses the
organization avatar (`https://github.com/<org>.png`), and bb itself
(`get-bb/*`, or a GitHub repository named `bb`) uses the getbb.app favicon.
Icons are cached in the plugin's database (`<dataDir>/plugins/bb--inbox/data.db`)
for 7 days; a failed fetch is retried after a day. Projects without an icon,
and icons that fail to load, show a two-letter monogram tinted from a hash of
the project name.

## Plugin decorations

Rows draw the sidebar decorations other plugins register:

- `experimental_sidebarProjectDecoration`: its `leading` node (such as a
  project emoji) stands in for the project icon when the project has no
  favicon.
- `experimental_sidebarThreadDecoration` `useDecoration`: `leading` text
  stands in for the project icon when there is neither a favicon nor a
  `leading` node, and `title` names a project that has no name. Rows draw no
  project hue or accent color.
- `experimental_sidebarThreadDecoration` `useThreadDecoration`: `label` (a
  link when `labelHref` is set) and `description` (in place of the branch)
  on the line below the title, with `trailing`, the `pullRequest` number in
  its state's color, and `icon` (in place of the provider icon) at its end.

## Sidebar layout

The `layout` setting (`inbox` or `classic`, default `inbox`) writes bb's
`sidebar.threadListProvider` preference, so the sidebar switches at once in
every window. On its first start the plugin applies the setting. Later starts
apply it only while that preference is `__automatic__`, so a choice made in
Settings → Appearance stands. Before you disable the plugin, switch to
Classic: a preference that names a disabled plugin leaves the sidebar on bb's
"missing thread list" placeholder.

```sh
bb plugin config bb--inbox set layout classic
```

## Settle and snooze

Settle a thread when you are done with it for now. It leaves Inbox and
Working for the Settled shelf. Archive is separate and unchanged. Pinned
threads cannot be settled: their rows and menus offer no Settle, and
`bb inbox settle` on a pinned thread fails with an error. Unpin first.
Snooze hides a thread in the Snoozed shelf until a time: 1 hour, tomorrow at
9am, next Monday at 9am, or a picked time. Nothing settles on its own.

- **Row**: hovering a row swaps its status for a snooze clock and **Settle**.
  Settled rows offer **Unsettle**, snoozed rows **Wake**. Rows whose turn is
  running or that wait for an answer have no strip, because they would wake
  at once.
- **Menu**: "Settle thread" / "Unsettle thread" / "Wake thread now" and a
  **Snooze** submenu in every thread actions menu (row, right-click, thread
  header, long-press drawer).
- **Commands** (Settings → Keyboard, rebindable, and callable from leader
  keys): "Settle thread" (Mod+Shift+S), "Unsettle thread" (Mod+Shift+U),
  "Snooze thread…" (Mod+Shift+H, opens the picker), and one unbound command
  per preset. They act on the thread in view.
- **CLI**: `bb inbox list | settle [id] | unsettle [id] | snooze [id] <1h|tomorrow|monday|ISO time>`.

### Wake

A parked thread wakes, returns to the Inbox and is marked unread, when
something happens after it was parked:

| Event | Signal |
| ----- | ------ |
| A turn starts (a user, child or agent message) | `thread.active` |
| A turn finishes, including a child thread's | `thread.idle` |
| The thread fails | `thread.failed` |
| An approval or question is requested | `interaction.pending` |
| A background command finishes | `experimental_thread.events`, then a drop in `bb.sdk.threads.backgroundCommands` |
| A snooze time comes | a server timer |

The server deletes the record and marks the thread unread on each event. The
list also treats a thread as awake on its own, for events the server missed
while it was reloading: `latestAttentionAt` newer than `settledAt` (core moves
it when a root turn ends or a running thread fails), a pending interaction, a
running turn, or a snooze time in the past. A failure or a background command
that was already there when you settled does not wake the thread.

### Storage

Each parked thread is one `bb.storage.kv` row, `thread:<threadId>` →
`{ settledAt, snoozeUntil }` (`snoozeUntil` is null for a settled thread).
There is no Drizzle migration. `thread.deleted` drops a row, and the first
list read each hour drops rows for threads that no longer exist.
