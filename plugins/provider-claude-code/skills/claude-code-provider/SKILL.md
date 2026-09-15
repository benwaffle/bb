---
name: claude-code-provider
description: "Configure or troubleshoot BB-specific Claude Code provider settings and session behavior."
---

# Claude Code provider

Read settings with `bb plugin config provider-claude-code`; change a declared key
with `bb plugin config provider-claude-code set <key> <value>`.

- `chromeEnabled` defaults to `false`. It starts Claude Code with `--chrome` for
  Claude in Chrome tools. The host needs the extension and a claude.ai login.
  A change restarts the thread's Claude process before its next turn, preserving
  context.
- Structured plan, message editing, and compaction are supported through the
  corresponding `bb thread` commands. Unlisted model IDs are accepted by the
  provider; verify actual availability on the target host.

## Slash commands in the composer

The composer's `/` menu offers the skills Claude Code advertises beside the
scanned catalog: bundled skills such as `/code-review`, `/simplify`, `/loop`,
`/batch`, `/debug`, and `/claude-api`, plus user and plugin skills the scan did
not find. Claude Code CLI state commands (`/model`, `/config`, `/mcp`, and the
like) and terminal-only skills (`/doctor`) are left out because bb owns that
state. A running thread uses the list its own session published; the
new-thread composer, and a thread whose session has not started, use the most
recent list any Claude Code session published on that machine, which bb
persists across restarts. `bb project commands <project> --provider claude-code
[--thread <thread>]` lists the same merged catalog. The list refreshes when
Claude Code reports a change, for example after `/reload-skills`.

Picking a skill inserts it as a pill followed by its argument hint as
placeholder text; typing after the pill replaces the hint, and the prompt
reaches Claude Code as the literal line, for example `/code-review low`.

## Importing terminal sessions

`bb claude-code sessions [--dir <path>] [--limit <n>] [--json]` lists the
Claude Code sessions on a machine, newest first, with id, title, directory,
turn count, and last activity. Use it to find a session a user names by its
`/rename` title or by what it was about.

`bb claude-code import <session-id|title|/abs/path/session.jsonl>` creates a bb
thread from one of those sessions. A title must match exactly one session's
custom title, agent name, or generated title. Sessions live under
`~/.claude/projects/<project>/<session-id>.jsonl` on the machine that ran them
(`CLAUDE_CONFIG_DIR` relocates that directory).

- The transcript is read and translated on the machine that holds it, so the
  session must be on a connected bb machine. With several connected machines,
  pass `--machine <host-id>`.
- The thread joins the project whose source path on that machine equals the
  session's working directory; otherwise pass `--project <id>`. When the
  directory is a source of that project, it reuses a ready environment there
  or attaches the directory as an unmanaged workspace. Otherwise it uses the
  project's default environment, or a personal workspace for the Personal
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
- The home screen has an "Import a Claude Code session" section that lists
  the same sessions with a filter and an Import button; it marks sessions
  written in the last two minutes as active.
- `--json` prints the created thread and the session summary. The same
  operation is `sdk.threads.experimental_import` for scripts and plugins.

Inspect the thread and provider state after a change; do not restart unrelated
threads or change settings merely to answer a question.
