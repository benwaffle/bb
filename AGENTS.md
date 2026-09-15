# Codebase Guidelines

## Task Completion

- Carry the requested change through implementation, relevant verification, and fixes for failures it causes. Continue authorized, reversible local work without asking for approval at each step; ask when a missing user decision blocks progress.
- Match verification to the change. Once relevant checks pass, broaden or repeat them only for new changes, failures, or unresolved concerns.
- Read the linked guidance when its topic applies to the task.

## Code And Contracts

- Code comments are forbidden, except for semantic tool directives and Plugin SDK declaration comments.
- When renaming a domain concept, search project-wide for stale names in variables, files, query keys, constants, tests, and docs; TypeScript only catches type references.
- Parse and validate data at system boundaries, then pass typed values internally. Restrict `unknown` and `as X` casts to genuinely unknowable boundaries and narrow immediately.
- Keep one-off types local; share types only for real cross-package contracts.
- Optional or nullable fields must represent meaningful absence. Fill defaults once at the server boundary and pass explicit values through internal routes, commands, and persisted events.
- Delete accepted-but-ignored route or command fields, or implement them end to end. Document route and command behavior when it is non-obvious.

## Server And Daemon

- The server owns product policy: defaults, instructions, manager behavior, tool lists, and thread behavior. The host daemon owns host-local primitives, provider translation, runtime/session management, and workspace execution.
- Return raw host-local data from the daemon; assemble product behavior on the server. Move responsibility across this boundary only when the change requires it.
- Increment `HOST_DAEMON_PROTOCOL_VERSION` for changes to server/daemon wire fields, including their types, requiredness, defaults, or meaning, unless compatibility with the previously shipped daemon is deliberately preserved and tested. This covers session payloads, WebSocket messages, and host RPC commands/results. Shared TypeScript builds do not verify compatibility with enrolled machines; the version bump triggers their update.

## CLI And Plugin API

- Every end-user feature must also be usable through the SDK and `bb` CLI; ship and document these surfaces with the UI.
- For changes to CLI commands/flags or user-facing configuration (env vars, `.bb/` workspace files, settings), update the discoverable surfaces listed in [docs/cli-guide-and-skill.md](docs/cli-guide-and-skill.md).
- New public plugin API members (`@get-bb/plugin-sdk/app` exports, `app.slots.*` methods, or `BbPluginApi` properties) require an `experimental_` prefix and an entry in [docs/api_to_audit.md](docs/api_to_audit.md) describing behavior and stabilization criteria. Stabilization includes the audit, a project-wide rename, and removal of the entry.
- The Plugin Guide is the only plugin API documentation. Add new surfaces to `packages/plugin-api-map/src/surfaces.ts` with their SDK symbols.

## Data Access

- Use targeted `WHERE`/`JOIN` queries instead of loading all rows and filtering in JavaScript. Add indexes only when required by the query.
- Change Drizzle schemas and regenerate migrations/snapshots; never edit snapshot JSON manually.
- Never mock the database in tests. Use `createConnection(":memory:")` and `migrate(db)`.

## UI

- Use sanctioned typography tokens instead of arbitrary `text-[Npx]` classes.
- Derive theme colors from `--canvas`/`--ink` or other derived tokens; never use achromatic `oklch(L 0 0)` literals. Mix opaque steps in `oklch` and translucent steps in `oklab`. See `apps/app/src/components/ui/theme.css` and `theme.test.ts`.
- Never use CSS `@scope`; it causes severe WebKit style-recalculation costs. Confine styles with zero-specificity `:where(<roots>)` descendant and compound selector arms, as implemented in `packages/plugin-build/src/scope-plugin-utilities.ts`.
- Use the shared persistent responsive drawer for compact slide-out menus, pickers, popovers, and dialogs. Avoid modal primitives that add `inert` or `aria-hidden` to the app root. Start the transform before heavy content; realize content after two animation frames with a timeout fallback, then retain it. Verify representative drawers in iOS Simulator Safari and test app-root and deferred-realization behavior.

## Build And Test

- Use Turbo for builds, typechecks, and tests so upstream dependencies run first: `pnpm exec turbo run <task> --filter=@bb/<pkg>`. Use the package's actual name for other scopes. Bypass orchestration only for deliberate investigation; do not invoke package scripts or raw `tsc` routinely.
- Generated modules are gitignored: `packages/templates/src/generated/`, `packages/plugin-build/src/generated/`, and `packages/plugin-sdk/bundled-types/`. Never commit them or add a `--check` mode. New generated modules need Turbo tasks with explicit inputs, outputs, and consumer dependencies.
- If a plugin cannot resolve `@get-bb/plugin-sdk`, run `pnpm exec turbo run build:types --filter=@get-bb/plugin-sdk`.
- Test plausible failure modes; avoid trivial getters/setters and framework wiring. Pipe slow test output to a file and inspect it.
- Build Vitest projects with `sharedWorkerProjects` from `vitest.shared.ts`. Node tests share workers (`isolate: false`); DOM tests and files/helpers that mutate worker-global state receive isolated workers. Restore any global state a test changes.

## Issues, Pull Requests, And Debugging

- When filing issues, follow [docs/filing-issues.md](docs/filing-issues.md): reproduce first, check for duplicates, and include versions, copy-pasteable steps, verbatim expected/actual output, commit-permalink evidence, and what you ruled out. Add evidence to an existing issue when applicable.
- Use [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md): root cause, change, verification that demonstrates the fix, and `Fixes #N` when applicable.
- End every agent-created issue and PR body with `> AGENT GENERATED`.
- Ground debugging in observed state: logs, database queries, server APIs, or CLI output. For dev ports, data directories, entity IDs, and the local QA launcher, see [docs/debugging-and-qa.md](docs/debugging-and-qa.md).

## Fork Branching Strategy

This checkout is a long-term personal fork of upstream `get-bb/bb`, carrying local features while tracking upstream.

### Remotes And Branches

- all code changes (or changes to any file tracked in this repo) MUST happen in a worktree
- `upstream` is `get-bb/bb`. Read-only; never push to it.
- `origin` is `benwaffle/bb`, the fork on GitHub. Everything is pushed here.
- `main` mirrors `upstream/main` exactly. Never commit to it; only fast-forward it.
- `fork/main` is the integration branch: `main` plus every fork feature, rebased on top. This is what gets built and run. Force-pushes to it are expected.
- Feature work happens on `bi/<name>` branches cut from `fork/main`, then lands on `fork/main` as small, self-contained commits.

### Working On A Feature

These rules are absolute for agents working in this checkout:

- Before editing anything, create and check out `bi/<name>` from `fork/main`. Never edit or commit while `fork/main` or `main` is checked out, even for a one-line change, even when asked to "just commit". If you notice you are on `fork/main` with uncommitted work, stop, create the branch, and continue there.
- Commit as you go. Every time a coherent step typechecks and its tests pass, commit it on the branch. Never end a turn with uncommitted or untracked files you created; either commit them or say exactly which files are uncommitted and why.
- Landing on `fork/main` is a separate, explicit step the user asks for: squash the branch into one self-contained commit, fast-forward `fork/main` to it, and delete the branch.
- Never touch files the task did not change. Unrelated modified files in the tree belong to someone else; do not stage, stash, or revert them.

### Syncing With Upstream

A bb automation ("Daily upstream sync of fork/main", 6:00 America/New_York) rebases `fork/main` onto upstream each day. It lands the rebase only when verification is green and every conflict was replayed mechanically, and it reports redundancy findings — fork features upstream has since absorbed — to the orchestrator thread. Otherwise it leaves a dated `bi/upstream-sync-YYYYMMDD` branch for a human decision.

```sh
git fetch upstream main:main
git tag fork/pre-sync-$(date +%Y-%m-%d) fork/main
git rebase main fork/main
git push --force-with-lease origin fork/main
git push origin main
```

If a rebase goes badly, reset `fork/main` to the pre-sync tag.

### Keeping Rebases Survivable

- `rerere` is enabled repo-locally so resolved conflicts replay automatically on later syncs.
- Keep each commit on `fork/main` a coherent, single-purpose change. Squash fixups into the commit they fix rather than adding "fix" commits on top.
- Order commits by churn: removals of upstream code first, additive features last.
- Prefer additive changes (plugins, config layers, new files) over edits to upstream files.
- Fork features must not add Drizzle migrations. Drizzle's SQLite migrator compares each journal entry's timestamp only against the last applied row, so a fork migration renumbered behind new upstream migrations by a sync re-runs itself and skips the upstream ones forever. Keep fork state in a JSON file under the server data dir or in an existing upstream table.
- When a fork feature is something upstream would accept, upstream it. Every merged feature is one fewer commit to carry.
- Avoid merging `main` into `fork/main`; that hides the fork's diff behind merge commits. `git log main..fork/main` should always show exactly what the fork changes.

### Plugins And Extensions Kept Outside The Fork

Features that a third-party plugin or a browser extension can deliver live in
[benwaffle/bb-plugins](https://github.com/benwaffle/bb-plugins) rather than
here, so they cost the fork no commits to rebase.

- `voice-whisper-local` installs with
  `bb plugin install git:https://github.com/benwaffle/bb-plugins.git@main --plugin voice-whisper-local`.
- `chrome-github-bb-button` loads unpacked from that repository's
  `extensions/` directory.

Prefer that repository for a new plugin. A plugin belongs here only when it
needs a bb change that is not released in `@get-bb/plugin-sdk` on npm, because
an external plugin builds against the published SDK.

`claude-code-session-import` stays here for that reason. It reuses the Claude
provider's stream translator and `@bb/shared-ui`, which are the right shape
beside the provider plugin, and it calls
`sdk.threads.experimental_providerSessions`, a fork-only route that upstream
does not have; an external copy would work on no other bb.

Two limits shape what an external plugin can do. bb aliases only the bare
`@get-bb/plugin-sdk` specifier when it loads a server entry, and it never
installs a git-sourced plugin's dependencies, so a server entry that imports an
SDK subpath fails to build on install; mirror the subpath's exports in the
plugin instead, and keep type-only imports on the SDK because `import type` is
erased before bundling. A bundled plugin id is also reserved, so a builtin has
to leave the registry here before the external copy of the same plugin can
install.

### Running The Fork

The fork is used through the packaged desktop app at `apps/desktop/release/mac-arm64/bb.app`. That bundle embeds its own copy of the server and host daemon, so source changes do nothing until the app is rebuilt and relaunched. After landing any feature on `fork/main`, or after an upstream sync:

```sh
pnpm --filter @bb/desktop package
pkill -f 'bb.app/Contents/MacOS/bb'
open apps/desktop/release/mac-arm64/bb.app
```

`package` builds the bb-app runtime through Turbo, compiles the desktop shell, and writes an unsigned `.app` directory. Quitting the desktop app also stops its server and host daemon. Existing agent shells keep the old daemon environment until their threads are restarted.
