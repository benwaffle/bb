import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  useRpc,
  type PluginHomepageSectionProps,
  type StandardSchemaV1InferOutput,
} from "@get-bb/plugin-sdk/app";
import { Badge } from "@bb/shared-ui/badge";
import { Button } from "@bb/shared-ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bb/shared-ui/dialog";
import { Input } from "@bb/shared-ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bb/shared-ui/select";
import type { claudeSessionImportRpcContract } from "./src/rpc-contract.js";
import {
  describeHiddenReason,
  type SessionHiddenReason,
} from "./src/session-visibility.js";

type Listing = StandardSchemaV1InferOutput<
  (typeof claudeSessionImportRpcContract)["listSessions"]["output"]
>;
type SessionEntry = Listing["sessions"][number];
type ProjectChoice = Listing["projects"][number];

const PAGE_SIZE = 15;
const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

const HIDDEN_REASON_HINTS: Record<SessionHiddenReason, string> = {
  imported: "This session was already imported into a bb thread.",
  "bb-thread": "A bb thread already holds this Claude Code session.",
  "bb-workspace":
    "This session ran in a workspace bb provisioned, so a bb thread created it.",
  "thread-workspace":
    "This session ran in a directory bb named after one of its threads, so a bb thread created it.",
  "bb-driven-session":
    "The transcript shows bb drove this session, so it belongs to a bb thread on this or another bb instance.",
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatAge(at: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function shortenPath(path: string | null): string {
  if (path === null) return "unknown directory";
  const home = path.match(/^\/(?:Users|home)\/[^/]+/u);
  return home === null ? path : `~${path.slice(home[0].length)}`;
}

function matchesFilter(session: SessionEntry, filter: string): boolean {
  if (filter.length === 0) return true;
  const haystack = [
    session.title,
    session.firstPrompt,
    session.cwd,
    session.projectName,
    session.sessionId,
  ]
    .filter((value): value is string => value !== null)
    .join("\n")
    .toLowerCase();
  return haystack.includes(filter);
}

function projectLabel(project: ProjectChoice): string {
  return project.kind === "personal"
    ? `No project (${project.name})`
    : project.name;
}

function sortForProject(
  sessions: readonly SessionEntry[],
  projectId: string | null,
): SessionEntry[] {
  if (projectId === null) return [...sessions];
  return [...sessions].sort((a, b) => {
    const aMatch = a.projectId === projectId ? 0 : 1;
    const bMatch = b.projectId === projectId ? 0 : 1;
    return aMatch - bMatch || b.lastActivityAt - a.lastActivityAt;
  });
}

interface SessionRowProps {
  session: SessionEntry;
  now: number;
  importing: boolean;
  projects: readonly ProjectChoice[];
  targetProjectId: string | null;
  onChooseProject: (session: SessionEntry, projectId: string) => void;
  onImport: (session: SessionEntry, projectId: string) => void;
}

function SessionRow({
  session,
  now,
  importing,
  projects,
  targetProjectId,
  onChooseProject,
  onImport,
}: SessionRowProps) {
  const label = session.title ?? session.firstPrompt ?? "Untitled session";
  const active = now - session.lastActivityAt < ACTIVE_WINDOW_MS;
  const owned = session.projectId !== null;
  const targetProject =
    targetProjectId === null
      ? null
      : (projects.find((project) => project.id === targetProjectId) ?? null);
  return (
    <li className="flex flex-wrap items-start gap-3 py-3">
      <div className="min-w-0 flex-1 basis-64">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">
            {label}
          </span>
          {active ? (
            <Badge
              variant="outline"
              title="A terminal is still writing this session. The import copies what exists now; later terminal turns stay out of the thread."
            >
              active
            </Badge>
          ) : null}
          {session.hiddenReason === null ? null : (
            <Badge
              variant="outline"
              title={HIDDEN_REASON_HINTS[session.hiddenReason]}
            >
              {describeHiddenReason(session.hiddenReason)}
            </Badge>
          )}
          <Badge variant={owned ? "secondary" : "outline"}>
            {owned ? session.projectName : "no project"}
          </Badge>
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {shortenPath(session.cwd)} · {session.turnCount}{" "}
          {session.turnCount === 1 ? "turn" : "turns"} ·{" "}
          {formatAge(session.lastActivityAt, now)}
        </div>
        {!owned ? (
          <div className="text-xs text-muted-foreground">
            This directory is not a bb project source. The thread imports as a
            personal thread unless you pick a project; it then runs in that
            project's default environment.
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        {!owned ? (
          <Select
            value={targetProjectId ?? undefined}
            onValueChange={(next) => onChooseProject(session, next)}
          >
            <SelectTrigger
              className="h-8 w-44"
              aria-label={`Project for ${label}`}
            >
              <SelectValue placeholder="Choose project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {projectLabel(project)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          disabled={importing || targetProjectId === null}
          onClick={() => {
            if (targetProjectId !== null) onImport(session, targetProjectId);
          }}
        >
          {importing
            ? "Importing…"
            : targetProjectId === null
              ? "Choose a project"
              : owned || targetProject?.kind === "personal"
                ? "Import"
                : `Import into ${targetProject?.name ?? "project"}`}
        </Button>
      </div>
    </li>
  );
}

interface SessionBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
}

function SessionBrowserDialog({
  open,
  onOpenChange,
  projectId,
}: SessionBrowserDialogProps) {
  const rpc = useRpc<typeof claudeSessionImportRpcContract>();
  const threadActions = useSidebarThreadActions();
  const [listing, setListing] = useState<Listing | null>(null);
  const [machine, setMachine] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [revealHidden, setRevealHidden] = useState(false);
  const [chosenProjects, setChosenProjects] = useState<Record<string, string>>(
    {},
  );
  const [now, setNow] = useState(() => Date.now());
  const activeRef = useRef(true);
  const attemptedRef = useRef(false);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const load = useCallback(
    async (selectedMachine: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const next = await rpc.call("listSessions", {
          machine: selectedMachine,
          dir: null,
        });
        if (!activeRef.current) return;
        setListing(next);
        setMachine(next.machine.id);
        setNow(Date.now());
      } catch (caught) {
        if (!activeRef.current) return;
        setError(errorMessage(caught));
      } finally {
        if (activeRef.current) setLoading(false);
      }
    },
    [rpc],
  );

  useEffect(() => {
    if (!open) {
      attemptedRef.current = false;
      return;
    }
    if (attemptedRef.current || listing !== null || loading) return;
    attemptedRef.current = true;
    setError(null);
    void load(null);
  }, [open, listing, loading, load]);

  const personalProjectId = useMemo(
    () =>
      listing?.projects.find((project) => project.kind === "personal")?.id ??
      null,
    [listing],
  );

  const matching = useMemo(() => {
    if (listing === null) return [];
    const needle = filter.trim().toLowerCase();
    return listing.sessions.filter((session) => matchesFilter(session, needle));
  }, [listing, filter]);

  const hiddenCount = useMemo(
    () => matching.filter((session) => session.hiddenReason !== null).length,
    [matching],
  );

  const visible = useMemo(
    () =>
      sortForProject(
        revealHidden
          ? matching
          : matching.filter((session) => session.hiddenReason === null),
        projectId,
      ),
    [matching, revealHidden, projectId],
  );

  const onImport = useCallback(
    async (session: SessionEntry, targetProjectId: string) => {
      if (listing === null) return;
      setImporting(session.sessionId);
      setError(null);
      try {
        const result = await rpc.call("importSession", {
          sessionId: session.sessionId,
          machine: listing.machine.id,
          projectId: targetProjectId,
        });
        if (!activeRef.current) return;
        onOpenChange(false);
        threadActions.open(result.threadId);
      } catch (caught) {
        if (!activeRef.current) return;
        setError(errorMessage(caught));
      } finally {
        if (activeRef.current) setImporting(null);
      }
    },
    [listing, onOpenChange, rpc, threadActions],
  );

  const connectedMachines =
    listing?.machines.filter((candidate) => candidate.connected) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && importing !== null) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)_auto] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import a Claude Code session</DialogTitle>
          <DialogDescription>
            Continue a conversation you started with{" "}
            <code className="font-mono">claude</code> in a terminal. The thread
            gets the session's turns, and its first message forks the session
            from the last imported turn, so the terminal session is never
            modified.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          {connectedMachines.length > 1 && machine !== null ? (
            <Select
              value={machine}
              onValueChange={(next) => {
                setMachine(next);
                void load(next);
              }}
            >
              <SelectTrigger className="h-8 w-48" aria-label="Machine">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {connectedMachines.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Input
            className="h-8 min-w-48 flex-1"
            placeholder="Filter by title, prompt, or directory"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setShown(PAGE_SIZE);
            }}
            aria-label="Filter sessions"
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={loading}
            onClick={() => void load(machine)}
          >
            Refresh
          </Button>
        </div>
        <div className="min-h-0 overflow-y-auto">
          {error !== null ? (
            <div className="whitespace-pre-wrap py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
          {loading && listing === null ? (
            <div className="py-2 text-xs text-muted-foreground">
              Reading sessions…
            </div>
          ) : null}
          {listing !== null && visible.length === 0 && !loading ? (
            <div className="py-2 text-xs text-muted-foreground">
              {listing.sessions.length === 0
                ? `No Claude Code sessions on ${listing.machine.name}.`
                : matching.length === 0
                  ? "No sessions match the filter."
                  : "Every matching session already belongs to a bb thread."}
            </div>
          ) : null}
          {hiddenCount > 0 ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <span>
                {hiddenCount} {hiddenCount === 1 ? "session" : "sessions"}{" "}
                already in bb
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRevealHidden((current) => !current);
                  setShown(PAGE_SIZE);
                }}
              >
                {revealHidden ? "Hide" : "Show"}
              </Button>
            </div>
          ) : null}
          {visible.length > 0 ? (
            <ul className="divide-y divide-border">
              {visible.slice(0, shown).map((session) => (
                <SessionRow
                  key={session.sessionId}
                  session={session}
                  now={now}
                  importing={importing === session.sessionId}
                  projects={listing?.projects ?? []}
                  targetProjectId={
                    session.projectId ??
                    chosenProjects[session.sessionId] ??
                    projectId ??
                    personalProjectId
                  }
                  onChooseProject={(target, chosen) =>
                    setChosenProjects((current) => ({
                      ...current,
                      [target.sessionId]: chosen,
                    }))
                  }
                  onImport={(target, chosen) => void onImport(target, chosen)}
                />
              ))}
            </ul>
          ) : null}
          {visible.length > shown ? (
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              onClick={() => setShown((count) => count + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, visible.length - shown)} more of{" "}
              {visible.length - shown}
            </Button>
          ) : null}
        </div>
        <div className="text-xs text-muted-foreground">
          A session whose directory belongs to a bb project runs there; any
          other session becomes a personal thread unless you pick a project on
          its row, in which case it runs in that project's default environment.
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClaudeSessionImportSection({ projectId }: PluginHomepageSectionProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-card-foreground">
      <div className="min-w-0">
        <div className="text-sm font-medium">Import a Claude Code session</div>
        <div className="text-xs text-muted-foreground">
          Continue a conversation you started with{" "}
          <code className="font-mono">claude</code> in a terminal, with its
          history and context.
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Browse sessions
      </Button>
      <SessionBrowserDialog
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
      />
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.homepageSection({
    id: "claude-session-import",
    title: "Claude Code sessions",
    component: ClaudeSessionImportSection,
  });
});
