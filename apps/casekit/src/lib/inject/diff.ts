import type { LineRange } from "casekit-schema";
import { git } from "casekit-core";
import { parseHunkRanges } from "diffkit";
import { isSourceFile } from "../mine/classify.js";

/** non-test, non-generated ts/tsx files that still exist post-commit, the only ones inject may target */
export function touchedSourceFiles(mirror: string, base: string, commit: string): string[] {
  const paths = git(mirror, ["diff", "--name-status", "-M", base, commit, "--", "*.ts", "*.tsx"])
    .split("\n")
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      const fields = line.split("\t");
      const status = fields[0] as string;
      if (status.startsWith("D")) return [];
      // "M path" / "A path" / "R100 old new" / "C100 old new"
      return [fields.at(-1) as string];
    });
  return [...new Set(paths)].filter(isSourceFile);
}

/** lines actually added or modified, the region inject may place a defect in */
export function changedRanges(
  mirror: string,
  base: string,
  commit: string,
  path: string,
): LineRange[] {
  return parseHunkRanges(git(mirror, ["diff", "-U0", "-M", base, commit, "--", path]));
}

export function withinAnyRange(range: LineRange, ranges: readonly LineRange[]): boolean {
  return ranges.some(([s, e]) => range[0] >= s && range[1] <= e);
}
