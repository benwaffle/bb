import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatMemoryBytes } from "@bb/domain";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { PageShell } from "@/components/ui/page-shell.js";
import { listSidebarNavigationThreads } from "@/hooks/cache-owners/query-cache";
import { useHostMemoryUsage, useHosts } from "@/hooks/queries/host-queries";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import {
  getSettingsMachineRoutePath,
  getSettingsRoutePath,
  getThreadRoutePath,
} from "@/lib/route-paths";
import {
  buildMachineMemoryRows,
  DEFAULT_MACHINE_MEMORY_SORT,
  nextMachineMemorySort,
  sortMachineMemoryRows,
  type MachineMemorySort,
  type MachineMemorySortColumn,
} from "./machine-memory-rows";

const HEADER_CELL_CLASS =
  "px-3 py-2 text-left text-xs font-normal text-muted-foreground";
const BODY_CELL_CLASS = "px-3 py-2 align-top text-sm text-foreground";
const NUMERIC_CELL_CLASS = "whitespace-nowrap text-right tabular-nums";

function SortableHeader({
  align = "left",
  column,
  label,
  onSort,
  sort,
}: {
  align?: "left" | "right";
  column: MachineMemorySortColumn;
  label: string;
  onSort: (column: MachineMemorySortColumn) => void;
  sort: MachineMemorySort;
}) {
  const active = sort.column === column;
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort.descending ? "descending" : "ascending") : "none"
      }
      className={cn(HEADER_CELL_CLASS, align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring",
          align === "right" && "flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        <Icon
          name="ChevronDown"
          aria-hidden
          className={cn(
            "size-3 transition-transform duration-150",
            !active && "opacity-0",
            active && !sort.descending && "rotate-180",
          )}
        />
      </button>
    </th>
  );
}

function MachineMemorySummary({
  connected,
  processCount,
  rssBytes,
  sampledAt,
}: {
  connected: boolean;
  processCount: number | null;
  rssBytes: number | null;
  sampledAt: number | null;
}) {
  const unavailable = !connected || rssBytes === null;
  return (
    <div className="rounded-lg border border-border bg-card">
      <dl className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <div className="px-4 py-3">
          <dt className="text-xs font-normal text-muted-foreground">
            Machine total
          </dt>
          <dd className="mt-0.5 text-sm tabular-nums text-foreground">
            {!connected
              ? "Offline"
              : rssBytes === null
                ? "Not sampled yet"
                : formatMemoryBytes(rssBytes)}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs font-normal text-muted-foreground">
            Processes
          </dt>
          <dd className="mt-0.5 text-sm tabular-nums text-foreground">
            {unavailable || processCount === null ? "—" : processCount}
          </dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-xs font-normal text-muted-foreground">
            Last sample
          </dt>
          <dd className="mt-0.5 text-sm tabular-nums text-foreground">
            {unavailable || sampledAt === null
              ? "—"
              : new Date(sampledAt).toLocaleTimeString()}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function MachineMemoryView() {
  const { hostId } = useParams<{ hostId: string }>();
  const hostsQuery = useHosts({ includeCreating: true });
  const navigationQuery = useSidebarNavigation();
  const memoryQuery = useHostMemoryUsage(hostId ?? null);
  const [sort, setSort] = useState<MachineMemorySort>(
    DEFAULT_MACHINE_MEMORY_SORT,
  );

  const host =
    hostsQuery.data?.find((candidate) => candidate.id === hostId) ?? null;
  const rows = useMemo(() => {
    if (!navigationQuery.data || hostId === undefined) {
      return [];
    }
    return sortMachineMemoryRows(
      buildMachineMemoryRows(
        listSidebarNavigationThreads(navigationQuery.data),
        hostId,
      ),
      sort,
    );
  }, [hostId, navigationQuery.data, sort]);

  if (hostsQuery.data === undefined) {
    return (
      <PageShell contentClassName="pt-4 md:pt-5">
        <div className="mx-auto w-full max-w-3xl">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      </PageShell>
    );
  }

  if (host === null) {
    return (
      <PageShell contentClassName="pt-4 md:pt-5">
        <div className="mx-auto w-full max-w-3xl space-y-3">
          <Link
            to={getSettingsRoutePath("machines")}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon name="ChevronLeft" className="size-3.5" />
            Machines
          </Link>
          <p className="text-sm text-muted-foreground">
            Machine is no longer paired.
          </p>
        </div>
      </PageShell>
    );
  }

  const connected = host.status === "connected";
  const total = memoryQuery.data ?? null;

  return (
    <PageShell contentClassName="pt-4 md:pt-5">
      <div className="mx-auto w-full max-w-3xl space-y-6 pb-10">
        <div className="space-y-3">
          <Link
            to={getSettingsMachineRoutePath(host.id)}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <Icon name="ChevronLeft" className="size-3.5" />
            {host.name}
          </Link>
          <div className="space-y-1">
            <h1 className="text-lg font-medium text-foreground">Memory</h1>
            <p className="text-sm text-muted-foreground">
              Resident memory of each thread&apos;s agent process tree on{" "}
              {host.name}, counting every process the agent spawned. The host
              daemon samples it every few seconds while the agent runs.
            </p>
          </div>
        </div>

        <MachineMemorySummary
          connected={connected}
          processCount={total?.processCount ?? null}
          rssBytes={total?.rssBytes ?? null}
          sampledAt={total?.sampledAt ?? null}
        />

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {connected
              ? "No agent processes are running on this machine."
              : "This machine is offline, so nothing is being sampled."}
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <table className="w-full border-collapse">
              <thead className="border-b border-border bg-surface-recessed/55">
                <tr>
                  <SortableHeader
                    column="thread"
                    label="Thread"
                    onSort={(column) =>
                      setSort((current) =>
                        nextMachineMemorySort(current, column),
                      )
                    }
                    sort={sort}
                  />
                  <SortableHeader
                    align="right"
                    column="memory"
                    label="Memory"
                    onSort={(column) =>
                      setSort((current) =>
                        nextMachineMemorySort(current, column),
                      )
                    }
                    sort={sort}
                  />
                  <SortableHeader
                    align="right"
                    column="processes"
                    label="Processes"
                    onSort={(column) =>
                      setSort((current) =>
                        nextMachineMemorySort(current, column),
                      )
                    }
                    sort={sort}
                  />
                  <th scope="col" className={HEADER_CELL_CLASS}>
                    Attribution
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.threadId}>
                    <td className={cn(BODY_CELL_CLASS, "min-w-0")}>
                      <Link
                        to={getThreadRoutePath({
                          projectId: row.projectId,
                          threadId: row.threadId,
                        })}
                        className="block truncate text-foreground no-underline hover:underline hover:underline-offset-2"
                        title={row.title}
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className={cn(BODY_CELL_CLASS, NUMERIC_CELL_CLASS)}>
                      {formatMemoryBytes(row.usage.rssBytes)}
                    </td>
                    <td className={cn(BODY_CELL_CLASS, NUMERIC_CELL_CLASS)}>
                      {row.usage.processCount}
                    </td>
                    <td
                      className={cn(
                        BODY_CELL_CLASS,
                        "whitespace-nowrap text-muted-foreground",
                      )}
                    >
                      {row.usage.sharedThreadCount > 1
                        ? `Shared by ${row.usage.sharedThreadCount} threads`
                        : "Own processes"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}
