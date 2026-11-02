import {
  isActionable,
  isWorkingStatus,
  type InboxStatus,
  type WorkingStatus,
} from "./status.js";

export const WORKING_EXIT_GRACE_MS = 2000;

export interface GraceObservation {
  id: string;
  status: InboxStatus;
  isPinned: boolean;
}

export interface GraceState {
  workingSince: ReadonlyMap<string, number>;
  workingStatus: ReadonlyMap<string, WorkingStatus>;
  stoppedAt: ReadonlyMap<string, number>;
  returnedAt: ReadonlyMap<string, number>;
}

export const EMPTY_GRACE_STATE: GraceState = {
  workingSince: new Map(),
  workingStatus: new Map(),
  stoppedAt: new Map(),
  returnedAt: new Map(),
};

export function advanceGrace(
  previous: GraceState,
  observations: readonly GraceObservation[],
  now: number,
): GraceState {
  const workingSince = new Map<string, number>();
  const workingStatus = new Map<string, WorkingStatus>();
  const stoppedAt = new Map<string, number>();
  const returnedAt = new Map<string, number>();
  for (const { id, status, isPinned } of observations) {
    const priorReturn = previous.returnedAt.get(id);
    if (priorReturn !== undefined) returnedAt.set(id, priorReturn);
    const since = previous.workingSince.get(id);
    if (isWorkingStatus(status)) {
      workingSince.set(id, since ?? now);
      workingStatus.set(id, status);
      continue;
    }
    if (since === undefined) continue;
    const stopped = previous.stoppedAt.get(id) ?? now;
    if (isActionable(status) || isPinned) {
      returnedAt.set(id, stopped);
      continue;
    }
    if (now - stopped < WORKING_EXIT_GRACE_MS) {
      workingSince.set(id, since);
      workingStatus.set(id, previous.workingStatus.get(id) ?? "working");
      stoppedAt.set(id, stopped);
      continue;
    }
    returnedAt.set(id, stopped);
  }
  return { workingSince, workingStatus, stoppedAt, returnedAt };
}

export function isInGrace(state: GraceState, id: string): boolean {
  return state.stoppedAt.has(id);
}

export function graceStatus(state: GraceState, id: string): WorkingStatus | null {
  if (!state.stoppedAt.has(id)) return null;
  return state.workingStatus.get(id) ?? "working";
}

export function nextGraceExpiry(state: GraceState): number | null {
  let earliest: number | null = null;
  for (const stopped of state.stoppedAt.values()) {
    const expiry = stopped + WORKING_EXIT_GRACE_MS;
    if (earliest === null || expiry < earliest) earliest = expiry;
  }
  return earliest;
}

export function sameGraceState(left: GraceState, right: GraceState): boolean {
  return (
    sameMap(left.workingSince, right.workingSince) &&
    sameMap(left.workingStatus, right.workingStatus) &&
    sameMap(left.stoppedAt, right.stoppedAt) &&
    sameMap(left.returnedAt, right.returnedAt)
  );
}

function sameMap<Value>(
  left: ReadonlyMap<string, Value>,
  right: ReadonlyMap<string, Value>,
): boolean {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}
