---
name: claude-code-session-import
description: Import a Claude Code session started in a terminal into a bb thread that continues it, or list the sessions on a machine to find one by title or directory.
---

# Claude Code session import

Use this skill when a user wants to continue a terminal `claude` conversation
in bb, asks which Claude Code sessions exist on a machine, or names a session
by its `/rename` title or by what it was about.

## Listing sessions

`bb claude-code sessions [--dir <path>] [--machine <host-id>] [--limit <n>] [--all] [--json]`
lists the importable Claude Code sessions on a machine, newest first, with id,
title, directory, turn count, last activity, and the bb project whose source
matches the directory. `--dir` narrows to sessions run in one directory.
`--json` returns the full entries.

Sessions that belong to bb are left out and counted in a footer line. Five
rules decide that, in order:

- `imported`: this plugin imported the session into a thread that still exists.
- `bb-thread`: the Claude session id matches a provider session identity of a
  claude-code thread the server knows, on any machine, including ids a thread
  picked up by resuming or forking, and ids bb held before the thread that
  owned them was deleted.
- `bb-workspace`: the session ran inside a workspace bb provisioned, which an
  environment row on that machine names. This catches a session bb created
  whose thread is gone, such as a short-lived worker a plugin spawned and
  deleted. A session in an attached checkout is not affected, because bb does
  not own that path.
- `thread-workspace`: a directory in the session's path is named after a thread
  bb still has, either the thread id itself or the id with an instance suffix
  such as `thr_abc123-1`. bb names a provisioned workspace after the thread it
  belongs to, so this catches the same worker sessions after the environment
  row is torn down and loses its path.
- `bb-driven-session`: the transcript itself shows bb drove the session — it
  records the `mcp__bb-bridge__` tool bb adds, or the plugin instructions bb
  appends to the system prompt. This covers a session another bb instance ran,
  such as a dev instance with its own database, where no row on this server can
  name it.

`--all` lists them too, each row marked with the reason. Every entry carries a
`hiddenReason` of `imported`, `bb-thread`, `bb-workspace`, `thread-workspace`,
`bb-driven-session`, or `null` in `--json` output, plus a `bbDriven` flag for
the transcript marker, and the payload's `hidden` field counts the ones left
out. Use `--all` when a user asks about a session the plain list does not show.

## Importing a session

`bb claude-code import <session-id|title|/abs/path/session.jsonl>` creates a bb
thread from one session. A title must match exactly one session's custom
title, agent name, or generated title. Sessions live under
`~/.claude/projects/<project>/<session-id>.jsonl` on the machine that ran them
(`CLAUDE_CONFIG_DIR` relocates that directory).

- The transcript is read and translated on the machine that holds it, so the
  session must be on a connected bb machine. With several connected machines,
  pass `--machine <host-id>`.
- The thread joins the project whose source path on that machine equals the
  session's working directory; otherwise pass `--project <id>`. When the
  directory is a source of that project, the import reuses a ready environment
  there or attaches the directory as an unmanaged workspace. Otherwise it uses
  the project's default environment, or a personal workspace for the Personal
  project. `--environment <id|path>` overrides this.
- Every human prompt becomes a turn in the thread with the assistant's replies
  and tool calls. `--turns A-B` imports a slice; `--title` overrides the
  session's title.
- The thread is created idle. Its first message forks the Claude session at
  the last imported turn, so the original transcript stays untouched and the
  conversation continues with exactly the history shown in bb. A session that
  a terminal is still writing can be imported; turns the terminal adds after
  the import stay out of the thread, and the two conversations diverge from
  that point. Sending a message is what starts the provider process.
- `--json` prints the created thread and the session summary. The same
  operation is `sdk.threads.experimental_import` for scripts and plugins.

## Home screen

The home screen's "Claude Code sessions" card has a "Browse sessions" button
that opens a panel listing the same sessions with a filter, a machine picker
when several machines are connected, and an Import button per row. Sessions
written in the last two minutes are marked active. A row whose directory is
not a bb project source offers a project picker; without a choice it imports
as a personal thread. Sessions already in bb are counted above the list and
appear only after pressing Show.
