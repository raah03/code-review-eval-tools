import { z } from "zod";

export const ArmSchema = z.enum(["baseline", "middleware"]);
export type Arm = z.infer<typeof ArmSchema>;

export interface Cell {
  case: string;
  state: string;
  arm: Arm;
  run: number;
}

/** states enumerated innermost, so each lineage always runs its states in order */
export function buildGrid(
  cases: readonly string[],
  states: readonly string[],
  arms: readonly Arm[],
  runs: number,
): Cell[] {
  const cells: Cell[] = [];
  for (const caseId of cases) {
    for (const arm of arms) {
      for (let run = 1; run <= runs; run++) {
        for (const state of states) {
          cells.push({ case: caseId, state, arm, run });
        }
      }
    }
  }
  return cells;
}

export function cellLabel(cell: Cell): string {
  return `${cell.case}/${cell.state}/${cell.arm}/r${cell.run}`;
}

/** one chain per case+run, keeps replicates independent */
export function lineageId(cell: Cell): string {
  return `${cell.case}/r${cell.run}`;
}
