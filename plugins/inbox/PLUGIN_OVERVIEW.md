An inbox for the sidebar: every thread you have not settled sits in one list, newest return first, with a glyph for what it needs. Working threads fold into a shelf at the bottom. Reading a thread never moves it; only Settle or Snooze does.

## What you get

- **Pinned** threads at the top, in your pin order.
- **Inbox**: every other thread, read or unread. A glyph marks threads that finished unread, need an answer, need an approval, or failed; read threads show the time since they came back.
- **Working** (running turns, and threads with a background command such as a dev server) shelf, collapsed by default with a count. A collapsed shelf still shows the thread you have open.
- Rows show the project's icon (its GitHub organization avatar, or a two-letter monogram), the project, the title, the branch with the agent's icon, and a colored status glyph or the time since the thread came back.
- Child threads stay under their parent. A child that needs you while its parent does not shows on its own with a fork glyph and "from" plus the parent's title.
- **Settle** a thread you are done with, or **snooze** it until later (1 hour, tomorrow 9am, next Monday 9am, or a time you pick), from the row's hover buttons, its menu, the keyboard (Mod+Shift+S, Mod+Shift+U, Mod+Shift+H) or `bb inbox`. Settled and Snoozed shelves sit at the bottom. A parked thread comes back to the inbox, unread, when it runs, finishes, fails, asks you something, or a background command ends.
- Ticket groups from other plugins, such as PR review, move as one group to the most urgent place among their threads. A ticket key on a group header or a row opens the ticket when the plugin links it.

## Settings

**Sidebar layout** switches between Inbox and bb's Classic thread list at once. You can also run `bb plugin config bb--inbox set layout classic`.
