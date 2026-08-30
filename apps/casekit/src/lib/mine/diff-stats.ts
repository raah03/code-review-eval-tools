import { git } from "casekit-core";
import { isSourceFile } from "./classify.js";

interface NumstatLine {
  path: string;
  added: number;
  removed: number;
}

/** dashes mark a binary file, never true for ts/tsx but parsed defensively */
function parseNumstat(raw: string): NumstatLine[] {
  if (raw.length === 0) return [];
  return raw
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [added, removed, path] = line.split("\t");
      return { path: path ?? "", added: Number(added) || 0, removed: Number(removed) || 0 };
    });
}

export interface DiffStats {
  changedLinesSourceOnly: number;
  linesAdded: number;
  linesRemoved: number;
  touchesSourceFileCount: number;
  isPureFormatting: boolean;
}

/** isPureFormatting diffs the same files again ignoring whitespace, empty hunks mean nothing but whitespace changed */
export function computeDiffStats(mirror: string, parent: string, commit: string): DiffStats {
  const plain = parseNumstat(
    git(mirror, ["diff", "--numstat", parent, commit, "--", "*.ts", "*.tsx"]),
  ).filter((f) => isSourceFile(f.path));

  if (plain.length === 0) {
    return {
      changedLinesSourceOnly: 0,
      linesAdded: 0,
      linesRemoved: 0,
      touchesSourceFileCount: 0,
      isPureFormatting: false,
    };
  }

  const linesAdded = plain.reduce((sum, f) => sum + f.added, 0);
  const linesRemoved = plain.reduce((sum, f) => sum + f.removed, 0);
  const changedLinesSourceOnly = linesAdded + linesRemoved;
  const touchesSourceFileCount = plain.length;

  const ignoringSpace = parseNumstat(
    git(mirror, [
      "diff",
      "--numstat",
      "--ignore-all-space",
      parent,
      commit,
      "--",
      ...plain.map((f) => f.path),
    ]),
  );
  const isPureFormatting = ignoringSpace.every((f) => f.added === 0 && f.removed === 0);

  return {
    changedLinesSourceOnly,
    linesAdded,
    linesRemoved,
    touchesSourceFileCount,
    isPureFormatting,
  };
}
