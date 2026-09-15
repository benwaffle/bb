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

Terminal Claude Code sessions are imported into bb threads by the separate
`claude-code-session-import` builtin plugin (`bb claude-code sessions` and
`bb claude-code import`); its skill owns the details.

Inspect the thread and provider state after a change; do not restart unrelated
threads or change settings merely to answer a question.
