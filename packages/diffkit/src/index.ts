import { createTwoFilesPatch, parsePatch, structuredPatch } from "diff";

export type LineRange = [number, number];

/** jsdiff opens every patch with an Index line and === rule, dropped here */
const PREAMBLE = /^Index: .*\n=+\n/;

export interface DiffOptions {
  /** lines of context around each hunk, defaults to 3 like diff -u.
   *  use 0 for parseHunkRanges */
  context?: number;
  /** path shown in the diff header lines */
  label?: string;
}

/** in-memory diff, empty string if identical */
export function diffFiles(before: string, after: string, options: DiffOptions = {}): string {
  const label = options.label ?? "file";
  const patch = createTwoFilesPatch(label, label, before, after, undefined, undefined, {
    context: options.context ?? 3,
  }).replace(PREAMBLE, "");
  return patch.includes("@@") ? patch : "";
}

/** with context a hunk's range comes out too wide, only context-0 ranges count as touched */
function hunkRanges(hunks: readonly { newStart: number; newLines: number }[]): LineRange[] {
  const ranges: LineRange[] = [];
  for (const hunk of hunks) {
    if (hunk.newLines > 0) ranges.push([hunk.newStart, hunk.newStart + hunk.newLines - 1]);
  }
  return ranges;
}

/** needs a context-0 patch */
export function parseHunkRanges(patch: string): LineRange[] {
  return parsePatch(patch).flatMap((file) => hunkRanges(file.hunks));
}

export function touchedRanges(before: string, after: string): LineRange[] {
  const { hunks } = structuredPatch("file", "file", before, after, undefined, undefined, {
    context: 0,
  });
  return hunkRanges(hunks);
}

export function rangesOverlap(a: LineRange, b: LineRange): boolean {
  return a[0] <= b[1] && a[1] >= b[0];
}

/** 1-indexed N| prefix so a model reads a position off the line instead of counting them */
function numberLines(content: string): string {
  return content
    .split("\n")
    .map((line, index) => `${index + 1}| ${line}`)
    .join("\n");
}

function mergeRanges(ranges: readonly LineRange[]): LineRange[] {
  const merged: LineRange[] = [];
  for (const range of [...ranges].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

/** window both prompts put around a changed line */
export const SLICE_CONTEXT = 20;

/** numbered windows around the given ranges, … marks an omitted gap. no ranges is the whole file */
export function sliceAroundRanges(
  content: string,
  ranges: readonly LineRange[],
  contextLines: number,
): string {
  const lines = content.split("\n");
  if (ranges.length === 0) return numberLines(content);

  const windows = mergeRanges(
    ranges.map(
      ([start, end]): LineRange => [
        Math.max(1, start - contextLines),
        Math.min(lines.length, end + contextLines),
      ],
    ),
  );
  const parts: string[] = [];
  windows.forEach(([lo, hi], index) => {
    if (index > 0) parts.push("…");
    for (let n = lo; n <= hi; n++) parts.push(`${n}| ${lines[n - 1]}`);
  });
  return parts.join("\n");
}
