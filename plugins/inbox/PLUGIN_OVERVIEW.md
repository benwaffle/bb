An inbox for the sidebar: the threads that stopped and need you sit on top, newest return first. Working and done threads fold into shelves at the bottom.

## What you get

- **Pinned** threads at the top, in your pin order.
- **Inbox**: threads that finished and are unread, need an answer, need an approval, or failed.
- **Working** (running turns, and threads with a background command such as a dev server) and **Done** shelves, collapsed by default with a count. A collapsed shelf still shows the thread you have open.
- Rows show the project's icon (its GitHub organization avatar, or a two-letter monogram), the project, the title, the branch with the agent's icon, and a colored status glyph or the time since the thread came back.
- Child threads stay under their parent. A child that needs you while its parent does not shows on its own with a fork glyph and "from" plus the parent's title.
- **Settle** a thread you are done with, or **snooze** it until later (1 hour, tomorrow 9am, next Monday 9am, or a time you pick), from the row's hover buttons, its menu, the keyboard (Mod+Shift+S, Mod+Shift+U, Mod+Shift+H) or `bb inbox`. Settled and Snoozed shelves sit at the bottom. A parked thread comes back to the inbox, unread, when it runs, finishes, fails, asks you something, or a background command ends.
- Ticket groups from other plugins, such as PR review, move as one group to the most urgent place among their threads.

## Settings

**Sidebar layout** switches between Inbox and bb's Classic thread list at once. You can also run `bb plugin config bb--inbox set layout classic`.
