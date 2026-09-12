#!/usr/bin/env bash
# Usage: bb-quiet.sh [allowed-thread-id ...]
# Exits 0 only when nothing a bb server/app restart would interrupt is running.
# Prints one line per blocker and exits 1 otherwise; exits 2 when a check
# itself fails, because an unreadable check is not a quiet reading.
#
# Checks, all via the bb CLI against $BB_SERVER_URL:
#   threads       bb thread list --include-hidden --json: status active|starting,
#                 or activity.activeBackgroundCommandCount/AgentCount/WorkflowCount > 0
#                 (every project incl. Personal; the given ids are ignored).
#                 Background work on an archived thread is not a blocker: its
#                 session is gone and bb cannot stop it, so it is listed under
#                 "phantom (archived thread)" instead.
#   plugin jobs   bb plugin install-jobs --json: queued|running|cancelling
#                 bb plugin update-jobs --json: queued|running
#   automations   bb automation list --project <p> --json per project
#                 (bb project list --include-personal): lastRunStatus running
#   environments  bb environment list --json: status creating|provisioning,
#                 lifecycle.teardown.status running (a failed teardown that
#                 needs recovery does not block), hostLifecycle removing
#   machines      bb machine list --json: lifecycle.phase creating|suspending|
#                 resuming|removing, lifecycle.teardown.status running
#   server move   bb server move status --json: .move non-null
#   app update    bb updates app status --json: activity.phase != idle
#   provider CLI  Settings -> Updates installs (POST /hosts/:id/provider-cli/install)
#                 are tracked only in server memory, with no CLI or API that lists
#                 them; each connected machine is probed through a bb machine
#                 terminal for the installer processes the providers spawn
#                 (npm install -g <pkg>@latest, codex update, the
#                 provider-installation.XXXXXX download script).
set -uo pipefail

allowed_json=$(printf '%s\n' "$@" | jq -R . | jq -sc 'map(select(length > 0))')
blockers=()
phantoms=()
failures=()

run() {
  local out
  if ! out=$(bb "$@" --json 2>/dev/null); then
    failures+=("bb $* failed")
    return 1
  fi
  if jq -e 'type == "object" and .ok == false' <<<"$out" >/dev/null 2>&1; then
    failures+=("bb $*: $(jq -r '.error.message' <<<"$out")")
    return 1
  fi
  printf '%s' "$out"
}

add() {
  local line
  while IFS= read -r line; do
    [[ -n $line ]] && blockers+=("$line")
  done <<<"$1"
}

if threads=$(run thread list --include-hidden); then
  add "$(jq -r --argjson allowed "$allowed_json" '
    .[] | select(.id as $id | $allowed | index($id) | not)
    | (.activity // {}) as $a
    | select(.status == "active" or .status == "starting"
        or (.archivedAt == null and (
          ($a.activeBackgroundCommandCount // 0) > 0
          or ($a.activeBackgroundAgentCount // 0) > 0
          or ($a.activeWorkflowCount // 0) > 0)))
    | "thread \(.id) [\(.projectId)] status=\(.status) bgCommands=\($a.activeBackgroundCommandCount // 0) bgAgents=\($a.activeBackgroundAgentCount // 0) workflows=\($a.activeWorkflowCount // 0): \(.title // "")"
  ' <<<"$threads")"
  while IFS= read -r line; do
    [[ -n $line ]] && phantoms+=("$line")
  done < <(jq -r '
    .[] | (.activity // {}) as $a
    | select(.archivedAt != null
        and .status != "active" and .status != "starting"
        and (($a.activeBackgroundCommandCount // 0) > 0
          or ($a.activeBackgroundAgentCount // 0) > 0
          or ($a.activeWorkflowCount // 0) > 0))
    | "thread \(.id) [\(.projectId)] archived \(.archivedAt / 1000 | floor | todate) bgCommands=\($a.activeBackgroundCommandCount // 0) bgAgents=\($a.activeBackgroundAgentCount // 0) workflows=\($a.activeWorkflowCount // 0): \(.title // "")"
  ' <<<"$threads")
fi

if jobs=$(run plugin install-jobs); then
  add "$(jq -r '.jobs[] | select(.state == "queued" or .state == "running" or .state == "cancelling")
    | "plugin install job \(.id) \(.state): \(.displayName)"' <<<"$jobs")"
fi

if jobs=$(run plugin update-jobs); then
  add "$(jq -r '.jobs[] | select(.state == "queued" or .state == "running")
    | "plugin update job \(.id) \(.state): \(.pluginId // .displayName // "")"' <<<"$jobs")"
fi

if projects=$(run project list --include-personal); then
  for project in $(jq -r '.[].id' <<<"$projects"); do
    if automations=$(run automation list --project "$project"); then
      add "$(jq -r '.[] | select(.lastRunStatus == "running")
        | "automation \(.id) [\(.projectId)] run in progress (\(.execution.mode)): \(.name)"' <<<"$automations")"
    fi
  done
fi

if environments=$(run environment list); then
  add "$(jq -r '.[] | select(.status == "creating" or .status == "provisioning"
      or .lifecycle.teardown.status == "running"
      or .hostLifecycle == "removing")
    | "environment \(.id) [\(.projectId)] status=\(.status) lifecycle=\(.lifecycle.phase) hostLifecycle=\(.hostLifecycle // "-")"' <<<"$environments")"
fi

if machines=$(run machine list); then
  add "$(jq -r '.[] | select((.lifecycle.phase as $p | ["creating","suspending","resuming","removing"] | index($p))
      or .lifecycle.teardown.status == "running")
    | "machine \(.id) \(.name) lifecycle=\(.lifecycle.phase)"' <<<"$machines")"
fi

if move=$(run server move status); then
  add "$(jq -r 'select(.move != null) | "server move in progress: \(.move | tostring)"' <<<"$move")"
fi

if app=$(run updates app status); then
  add "$(jq -r 'select(.activity.phase != "idle") | "bb app update \(.activity.phase)"' <<<"$app")"
fi

probe='ps -eo pid=,args= | grep -E "[p]rovider-installation\.|[n]pm (install|i) -g [^ ]+@latest|[c]odex update"; echo BBQ-END'
if [[ -n ${machines:-} ]]; then
  while IFS=$'\t' read -r host_id host_name; do
    [[ -z $host_id ]] && continue
    if ! term=$(run terminal create --machine "$host_id" --title bb-quiet-probe --command "$probe"); then
      continue
    fi
    term_id=$(jq -r '.id' <<<"$term")
    if bb terminal wait "$term_id" --exit --from-start --timeout 30s --json >/dev/null 2>&1 \
      && output=$(bb terminal output "$term_id" --json 2>/dev/null | jq -r '.chunks[].dataBase64' | base64 -d 2>/dev/null) \
      && [[ $output == *BBQ-END* ]]; then
      add "$(sed -n '/BBQ-END/q;s/\r$//;/./p' <<<"$output" | cut -c1-200 | sed "s|^ *|provider CLI install on $host_name: |")"
    else
      failures+=("provider CLI probe on $host_name did not finish")
    fi
    bb terminal close "$term_id" --json >/dev/null 2>&1
  done < <(jq -r '.[] | select(.status == "connected" and .lifecycle.phase == "active") | "\(.id)\t\(.name)"' <<<"$machines")
fi

for failure in "${failures[@]+"${failures[@]}"}"; do
  echo "check failed: $failure"
done
if (( ${#phantoms[@]} > 0 )); then
  echo "phantom (archived thread), not blocking:"
  for phantom in "${phantoms[@]}"; do
    echo "  $phantom"
  done
fi
for blocker in "${blockers[@]+"${blockers[@]}"}"; do
  echo "busy: $blocker"
done
if (( ${#failures[@]} > 0 )); then
  exit 2
fi
if (( ${#blockers[@]} > 0 )); then
  exit 1
fi
echo "quiet"
