import type { Edit, LineRange } from "casekit-schema";

/** every unique-anchor check in the pipeline reduces to this */
export function countOccurrences(content: string, snippet: string): number {
  return content.split(snippet).length - 1;
}

/** matched by content not line arithmetic, throws if missing or ambiguous, ambiguous needs widening not a guess */
export function locate(content: string, snippet: string, label: string): LineRange {
  const count = countOccurrences(content, snippet);
  if (count === 0) {
    throw new Error(`${label}: snippet not found`);
  }
  if (count > 1) {
    throw new Error(`${label}: matches ${count} times, needs widening`);
  }
  const index = content.indexOf(snippet);
  const start = content.slice(0, index).split("\n").length;
  const end = start + snippet.split("\n").length - 1;
  return [start, end];
}

/** one bounding range over all edits' touched text, active picks replace text else find text */
export function locateEdits(
  content: string,
  edits: readonly Edit[],
  active: boolean,
  label: string,
): LineRange {
  let range: LineRange | undefined;
  for (const edit of edits) {
    const r = locate(content, active ? edit.replace : edit.find, label);
    range = range ? [Math.min(range[0], r[0]), Math.max(range[1], r[1])] : r;
  }
  return range as LineRange;
}
