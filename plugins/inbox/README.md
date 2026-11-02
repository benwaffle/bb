# Inbox

The Inbox plugin draws bb's sidebar thread list as an inbox, after T3 Code's
sidebar. It registers the `inbox` thread list (`bb--inbox/inbox`). This phase
is read-only: it derives every placement from the live thread view and stores
no per-thread state.

## Sections

| Section | Shows | Order |
| ------- | ----- | ----- |
| Pinned | Pinned threads, whatever their status | Manual pin order, then pin time |
| Inbox | Threads that stopped and need you: unread done, input, approval, failed | Newest return first |
| Working | Threads whose agent turn is running (shelf, collapsed by default) | Newest work first |
| Done | Read threads with no attention state (shelf, collapsed by default) | Newest return first |

Archived and hidden threads do not show. The return time is the thread's
`latestAttentionAt`, or the moment the list saw it stop working, whichever is
later.

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
  such as a dev server or a file watcher. A thread with a running command
  never hides in Done. The row draws a terminal glyph instead of the turn
  spinner, so "turn active" and "background job running" look different.
  Background commands on archived threads are ignored, because bb can keep
  phantom command rows for them (get-bb/bb#6123).

An approval, a question or a failure outranks background work. Background
agents, workflows, plan mode and goals reported while the thread is idle do
not count. When the last command ends the thread leaves Working, after the
grace below, and lands in Inbox or Done by its other signals, sorted by the
moment it stopped.

### The 2-second grace

A thread that stops working, or whose last background command ends, stays
in Working for 2 seconds before it joins the inbox. This covers a turn that
ends just before its follow-up starts. The grace ends at once when the thread
becomes actionable (approval, input, failed) or is pinned.

## Children and groups

- A child thread nests under its parent, collapsed behind an "N children"
  toggle, unless it belongs somewhere louder: a child in Inbox leaves a parent
  that is not in Inbox, a working child leaves a parent in Done, and a pinned
  child goes to Pinned. A child shown apart has a fork glyph and
  "from <parent>".
- `experimental_sidebarThreadGroups` groups with two or more threads, or with
  placeholder rows, render as one group in the most urgent section among their
  threads (Inbox, then Working, then Done). Pinned and detached threads stay
  out of groups.

## Project icons

The server reads each project's `gitRemoteUrl`. A GitHub remote uses the
organization avatar (`https://github.com/<org>.png`), and bb itself
(`get-bb/*`, or a GitHub repository named `bb`) uses the getbb.app favicon.
Icons are cached in the plugin's database (`<dataDir>/plugins/bb--inbox/data.db`)
for 7 days; a failed fetch is retried after a day. Projects without an icon,
and icons that fail to load, show a two-letter monogram tinted from a hash of
the project name.

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

## Deferred to later phases

Settle, snooze and auto-settle, with their per-thread state, hover actions,
undo and CLI commands. With settle, the end of a background command is a wake
event that brings a settled thread back to the inbox.
