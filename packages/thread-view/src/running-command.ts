import type { TimelineCommandWorkRow, TimelineRow } from "@bb/server-contract";

export function isBackgroundableCommandRow(
  row: TimelineRow,
): row is TimelineCommandWorkRow {
  return (
    row.kind === "work" &&
    row.workKind === "command" &&
    row.status === "pending" &&
    row.approvalStatus === null
  );
}

export function findLatestBackgroundableCommandRow(
  rows: readonly TimelineRow[],
): TimelineCommandWorkRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index]!;
    if (row.kind === "turn") {
      const nested =
        row.children === null
          ? null
          : findLatestBackgroundableCommandRow(row.children);
      if (nested !== null) {
        return nested;
      }
    } else if (isBackgroundableCommandRow(row)) {
      return row;
    }
  }
  return null;
}
