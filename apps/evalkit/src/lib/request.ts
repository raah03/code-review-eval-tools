import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { caseDir, readCaseMeta } from "casekit-core";
import { touchedRanges, type LineRange } from "diffkit";
import type { ReviewRequest } from "reviewbot";
import { lineageId, type Cell } from "./grid.js";
import type { StateCache } from "./state-cache.js";

export interface BuiltRequest {
  request: ReviewRequest;
  /** empty at the first state, persisted since the analysis can't recover it otherwise */
  transitionTouchedRanges: Record<string, LineRange[]>;
}

function readIfPresent(dir: string, file: string): string | null {
  const path = join(dir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** the dataset to artifact boundary, review_files is the same set at every state so the surface stays stable */
export function buildRequest(datasetDir: string, cell: Cell, cache: StateCache): BuiltRequest {
  const meta = readCaseMeta(caseDir(datasetDir, cell.case));
  const pr = meta.iterations[0];
  if (!pr) throw new Error(`${cell.case}: meta.json has no iterations`);

  const index = meta.iterations.findIndex((it) => it.id === cell.state);
  if (index < 0) throw new Error(`${cell.case}: no iteration "${cell.state}" in meta.json`);
  const previousStep = index > 0 ? (meta.iterations[index - 1]?.id ?? null) : null;

  const baseDir = cache.dirFor(cell.case, "base");
  const stateDir = cache.dirFor(cell.case, cell.state);
  const previousDir = previousStep ? cache.dirFor(cell.case, previousStep) : null;

  const transitionTouchedRanges: Record<string, LineRange[]> = {};
  const files = pr.review_files.map((path) => {
    const current = readIfPresent(stateDir, path);
    if (current === null)
      throw new Error(`${cell.case}/${cell.state}: review file missing: ${path}`);
    const previous = previousDir ? readIfPresent(previousDir, path) : null;

    if (previousDir) {
      const ranges = touchedRanges(previous ?? "", current);
      if (ranges.length > 0) transitionTouchedRanges[path] = ranges;
    }
    return { path, base: readIfPresent(baseDir, path), current, previous };
  });

  return {
    request: {
      files,
      referenceLabel: "the base branch",
      lineage: { id: lineageId(cell), step: cell.state, previousStep },
    },
    transitionTouchedRanges,
  };
}
