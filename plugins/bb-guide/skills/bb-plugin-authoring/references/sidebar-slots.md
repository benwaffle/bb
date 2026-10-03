# Sidebar thread list slots

### Grouping sidebar threads

`app.slots.experimental_sidebarThreadGroups` nests threads in bb's sidebar
under groups your plugin defines, without replacing the list. Threads keep
their rows and behaviors (open, pin, archive, rename, drag). `useGroups` is a
React hook the host calls inside your plugin's context, so `useRpc` and
`useRealtime` work. Return the same array while nothing changed.

```tsx
app.slots.experimental_sidebarThreadGroups({
  id: "tickets",
  title: "Tickets",
  useGroups: () => {
    const tickets = useTickets();
    return useMemo(
      () =>
        tickets.map((ticket) => ({
          projectId: ticket.projectId,
          key: ticket.key,
          keyLabel: ticket.key,
          label: ticket.summary,
          icon: "GitPullRequestArrow",
          style: "minimal",
          threadIds: ticket.threadIds,
          rows: ticket.unstarted.map((work) => ({
            id: work.id,
            title: work.title,
            description: work.author,
            icon: { name: "GitPullRequest", tone: "success" },
            variant: "ghost",
            onSelect: () => openWork(work),
            action: { label: "+", run: () => startWork(work) },
          })),
        })),
      [tickets],
    );
  },
});
```

bb's Thread list shows groups in Organize → By project. A group gets a
collapsible header in its project when it holds at least two of the project's
root threads, or any placeholder rows; a lone thread stays a plain row. A
thread claimed by two groups stays in the first. Placeholder rows are muted
rows for work that has no thread yet, listed after the group's threads; their
`action` is a button shown on hover or focus (always on touch): an outlined
button for a word such as `"Start"`, or a compact round ghost button for a
single character such as `"+"`. `variant: "ghost"` draws a row as work not
started yet with more muted text; it adds no border or indent, so its title
lines up with thread rows at the same depth.

The header draws `icon` (an icon name; default Layers), then `keyLabel` in a
muted monospace style, then `label`. When the group has placeholder rows, bb
right-aligns `<threads>/<rows>`. `style: "card"` wraps the header and rows in
a bordered card; `"minimal"` draws no card and shows `keyLabel` as a small
muted pill at the start of the header in place of the icon; the default
`"flat"` matches other sidebar groups.

Placeholder rows and thread entries take an optional 14px leading
`icon: { name, tone }` and an optional `trailing` of `{ kind: "dot", tone }`
or `{ kind: "text", text }`, with `ExperimentalSidebarThreadGroupTone` one of
`success` (green), `muted` (grey), `accent` (purple), or `danger` (red):
open, draft, and merged pull requests, or agent state. Both also take an
optional integer `depth` that indents the row one step per level with a thin
connector rail, so a stack draws as a tree without glyphs in the title.

`rows` also accepts `ExperimentalSidebarThreadGroupThreadRow` entries,
`{ threadId, depth?, description?, icon?, trailing? }`, which decorate a real
thread row: `depth` indents it like a placeholder row's, and `description`
shows muted text after the title. The row keeps its open, pin, archive, rename, and
drag behaviors. Set `keepOrder: true` to show the group in the order you give:
threads only `threadIds` lists, then `rows` with threads and placeholders
interleaved, such as a stacked PR's review thread right after its base PR's
row. Without it, bb sorts the threads in its own order above the
placeholders. Older bb builds ignore thread entries and `keepOrder`, so also
list placed threads in `threadIds`.

A replacement thread list reads every plugin's groups with
`experimental_useSidebarThreadGroups()`, which adds a host-assigned `id` and
the `pluginId`, folds placed threads into `threadIds`, and always sets
`keepOrder` and `style`.
