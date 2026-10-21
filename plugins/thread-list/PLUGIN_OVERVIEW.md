The sidebar thread list, as a plugin.

## What you get

- **Pinned** and **Threads** sections, plus the custom sections you create.
- Organize by project, by machine, or chronologically, with sort by updated, created, or title.
- Nested child threads, worktree grouping, drag to reorder, pin, nest, and move between sections.
- Project header decorations from other plugins (`experimental_sidebarProjectDecoration`): a leading node before the name, a bold accent-colored name, and a tinted header row.
- Thread row decorations from other plugins (`experimental_sidebarThreadDecoration`): the row's project emoji or short text wherever the row is not under its project's header, plus a per-thread icon, label, description, and trailing state.
- Groups from other plugins (`experimental_sidebarThreadGroups`) in every mode, such as threads nested under a ticket, with placeholder rows for work that has no thread yet.
- Inline rename, keyboard jump shortcuts, and the same status glyphs bb draws elsewhere.
- Agent provider icons before thread titles, controlled by Organize → Rows → Provider icons.
- Two-line rows with the project, a plugin label, and the pull request or branch on a muted second line, controlled by Organize → Rows → Two-line rows.
- Unread threads listed above read ones, controlled by Organize → Groups → By read status.

## How it works

The plugin reads bb's live thread view through the plugin SDK and stores your layout choices (organization, sort, section order, collapsed groups) in its own storage, synced to every open window. Sections and thread moves go through bb's public API, so `bb thread section` and this list always agree.

Disable the plugin to hide the list; another thread-list plugin can take its place under Settings → Appearance.
