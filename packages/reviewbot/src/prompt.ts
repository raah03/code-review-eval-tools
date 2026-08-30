import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SLICE_CONTEXT, diffFiles, rangesOverlap, sliceAroundRanges, touchedRanges } from "diffkit";
import { loadTemplate, renderTemplate } from "model-client";
import type { Finding, ReviewRequest } from "./types.js";

// dist/prompt.js -> packages/reviewbot -> templates/review.md
const REVIEW = loadTemplate(
  join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "review.md"),
);

/** extra input only the stateful reviewer gets */
export interface History {
  /** what this lineage reported last time, exactly as returned */
  previousFindings: Finding[];
  previousLabel: string;
}

/** missing side diffs against empty, so additions don't read as errors */
function fileDiff(before: string | null | undefined, after: string, path: string): string {
  return diffFiles(before ?? "", after, { label: path }) || "(unchanged)";
}

/** windows around changed lines only, uses base not previous to cover every iteration */
function slicedContent(base: string | null, current: string): string {
  return sliceAroundRanges(current, touchedRanges(base ?? "", current), SLICE_CONTEXT);
}

/** no previous snapshot means unchanged can't be proven, so it's treated as changed */
function priorFindingChanged(finding: Finding, files: ReviewRequest["files"]): boolean {
  const file = files.find((f) => f.path === finding.file);
  if (!file || file.previous == null) return true;
  const ranges = touchedRanges(file.previous, file.current);
  return ranges.some((range) => rangesOverlap([finding.line_start, finding.line_end], range));
}

/** shared by both arms, all instructions live in templates/review.md, history is null for the stateless baseline */
export function renderReviewPrompt(request: ReviewRequest, history: History | null): string {
  return renderTemplate(REVIEW, {
    referenceLabel: request.referenceLabel,
    files: request.files.map((file) => ({
      path: file.path,
      diffVsBase: fileDiff(file.base, file.current, file.path),
      current: slicedContent(file.base, file.current),
      // skipped when nothing reads it, it's a real diff to compute
      ...(history
        ? { changedSincePrevious: fileDiff(file.previous, file.current, file.path) }
        : {}),
    })),
    history: history && {
      previousLabel: history.previousLabel,
      reportedFindings:
        history.previousFindings
          .map((f) => {
            const tag = priorFindingChanged(f, request.files)
              ? "[code changed since then]"
              : "[code unchanged since then]";
            return `- ${f.file}:${f.line_start}-${f.line_end} [${f.category}] ${tag} ${f.message}`;
          })
          .join("\n") || "(you reported nothing)",
    },
  }).trim();
}
