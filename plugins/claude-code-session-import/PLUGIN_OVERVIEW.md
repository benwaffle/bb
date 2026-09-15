Continue a conversation you started with `claude` in a terminal from bb, with its history and context. The plugin reads Claude Code's transcripts on the machine that holds them and turns a session into a bb thread whose next message picks up where the terminal left off.

## What you get

- A "Claude Code sessions" card on the home screen. "Browse sessions" opens a panel that lists the sessions on a connected machine, newest first, with a filter, the directory each ran in, and an Import button per row. Sessions whose directory is a bb project source import into that project; any other session imports as a personal thread unless you pick a project on its row.
- Sessions that belong to bb are left out of that list: ones this plugin imported, ones whose session id a bb thread holds or once held, and ones that ran in a workspace bb provisioned, whether an environment row still names that directory or the path is named after one of bb's threads, and ones whose transcript shows bb drove them, which covers sessions another bb instance ran. A line above the list counts them and reveals them on request, each row tagged with why it was hidden.
- `bb claude-code sessions [--dir <path>] [--machine <host-id>] [--limit <n>] [--all] [--json]` lists the same sessions from the CLI, with `--all` to include the ones already in bb.
- `bb claude-code import <session-id|title|session.jsonl> [--project <id>] [--environment <id|path>] [--machine <host-id>] [--title <text>] [--turns A-B] [--json]` creates the thread from a script or an agent.

## How it works

Every human prompt in the transcript becomes a turn in the new thread, with the assistant's replies and tool calls, stamped with their original times. The thread starts idle. Its first message forks the Claude session at the last imported turn, so the terminal transcript is never modified and the conversation continues with exactly the history bb shows. A session a terminal is still writing can be imported; turns added after the import stay out of the thread.

The transcript is read and translated on the machine that ran the session, so that machine must be connected to bb. Sessions live under `~/.claude/projects/<project>/<session-id>.jsonl`; `CLAUDE_CONFIG_DIR` relocates that directory.

## Requirements

- The Claude Code provider plugin, which runs the imported thread.
- Claude Code installed and signed in on the machine that holds the sessions.
