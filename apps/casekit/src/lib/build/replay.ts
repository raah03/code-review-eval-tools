import type { Finding, FindingId } from "casekit-schema";
import { countOccurrences } from "../locate.js";

export function applyEdit(text: string, find: string, replace: string, label: string): string {
  const count = countOccurrences(text, find);
  if (count === 0) {
    throw new Error(`${label}: not found`);
  }
  if (count > 1) {
    throw new Error(`${label}: matches ${count} times, needs widening`);
  }
  return text.replace(find, replace);
}

/** applies the active findings only, reverting is the plan's job not this one's */
export function replayFindings(
  contentAtCommit: ReadonlyMap<string, string>,
  findings: readonly Finding[],
  active: readonly FindingId[],
): Map<string, string> {
  const content = new Map(contentAtCommit);
  for (const finding of findings) {
    if (!active.includes(finding.id)) continue;
    const text = content.get(finding.file);
    if (text === undefined) continue;
    let next = text;
    for (const edit of finding.edits) {
      next = applyEdit(next, edit.find, edit.replace, `apply ${finding.id} in ${edit.file}`);
    }
    content.set(finding.file, next);
  }
  return content;
}
