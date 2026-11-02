---
name: inbox
description: "Settle, unsettle, snooze, or list parked threads in the Inbox sidebar with bb inbox."
---

# Inbox

The Inbox sidebar parks threads in two shelves:

- **Settled**: you are done with the thread for now. Archive is separate and
  unchanged.
- **Snoozed**: hidden until a time.

A parked thread returns to the Inbox when a turn starts or finishes, it fails,
it asks for an approval or input, a background command it runs finishes, or
(for a snooze) its time comes. Returning marks it unread.

```sh
bb inbox list                                   # thread id, settled|snoozed, time
bb inbox settle [thread-id]                     # defaults to the current thread
bb inbox unsettle [thread-id]                   # also wakes a snoozed thread
bb inbox snooze [thread-id] <1h|tomorrow|monday|ISO time>
```

Pinned threads cannot be settled; `bb inbox settle` fails on one until it
is unpinned. `tomorrow` and `monday` mean 9am local time on the server. Settle or snooze
only when the user asks; never settle threads on your own.
