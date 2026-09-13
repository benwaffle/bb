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
- Select the Fast service tier in the model picker or pass `--service-tier fast`
  to `bb thread spawn` for supported Opus models. Use
  `bb thread tell --service-tier fast` to change a thread on its next turn;
  `default` turns it off. Fast mode requires eligible Claude access;
  subscription accounts need usage credits. It is billed at premium rates.
  The provider passes the selection as a session-scoped SDK setting, so it
  does not change the user's Claude defaults.
- bb passes only `BB_CLAUDE_CODE_EXECUTABLE` and `CLAUDE_CODE_OAUTH_TOKEN` to
  the CLI. Mint the token with `claude setup-token` for machines with no
  interactive login.
- Structured plan, message editing, and compaction are supported through the
  corresponding `bb thread` commands. Unlisted model IDs are accepted by the
  provider; verify actual availability on the target host.

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
  session's working directory; otherwise pass `--project <id>`. It reuses a
  ready environment at that path or attaches the directory as an unmanaged
  workspace; `--environment <id|path>` overrides this.
- Every human prompt becomes a turn in the thread with the assistant's replies
  and tool calls. `--turns A-B` imports a slice; `--title` overrides the
  session's title.
- The thread is created idle. Its first message forks the Claude session, so
  the original transcript stays untouched and the conversation continues with
  full context. Sending a message is what starts the provider process.
- `--json` prints the created thread and the session summary. The same
  operation is `sdk.threads.experimental_import` for scripts and plugins.

Inspect the thread and provider state after a change; do not restart unrelated
threads or change settings merely to answer a question.
