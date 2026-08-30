import type { Finding, LineRange } from "casekit-schema";
import { logger } from "logger";
import { locate } from "../locate.js";
import { withinAnyRange } from "./diff.js";
import { SLOT_CATEGORY } from "./prompt.js";
import type { PlacedFinding } from "./scope.js";

export interface Proposal {
  slot: string;
  file: string;
  find: string;
  replace: string;
  description: string;
}

export interface ValidatedRound {
  findings: Finding[];
  placed: PlacedFinding[];
  /** empty means every slot passed, otherwise fed back to the model */
  issues: string[];
}

export interface ValidationInput {
  caseId: string;
  slots: readonly string[];
  proposals: readonly Proposal[];
  /** the only files a proposal may target */
  files: readonly string[];
  contentByFile: ReadonlyMap<string, string>;
  rangesByFile: ReadonlyMap<string, LineRange[]>;
}

/** returns issues rather than throwing, they become the retry prompt's feedback */
export function validateRound(input: ValidationInput): ValidatedRound {
  const { caseId, slots, proposals, files, contentByFile, rangesByFile } = input;
  const bySlot = new Map(proposals.map((p) => [p.slot, p]));

  const missing = slots.filter((s) => !bySlot.has(s));
  if (missing.length > 0) {
    return {
      findings: [],
      placed: [],
      issues: [`missing proposal(s) for slot(s): ${missing.join(", ")}`],
    };
  }

  const issues: string[] = [];
  const findings: Finding[] = [];
  const placed: PlacedFinding[] = [];

  for (const slot of slots) {
    const p = bySlot.get(slot) as Proposal;
    if (!files.includes(p.file)) {
      issues.push(`${slot}: ${p.file} is not one of this commit's changed source files`);
      continue;
    }
    if (p.find === p.replace) {
      issues.push(`${slot}: replace is identical to find`);
      continue;
    }
    const content = contentByFile.get(p.file) as string;
    let range: LineRange;
    try {
      range = locate(content, p.find, `${caseId} ${slot}`);
    } catch (error) {
      issues.push(`${slot}: ${error instanceof Error ? error.message : String(error)}`);
      logger.debug(
        `${caseId} ${slot}: proposed find in ${p.file} did not match verbatim:\n${p.find}`,
      );
      continue;
    }
    if (!withinAnyRange(range, rangesByFile.get(p.file) ?? [])) {
      issues.push(
        `${slot}: lines ${range[0]}-${range[1]} of ${p.file} fall outside this commit's changed lines`,
      );
      continue;
    }
    findings.push({
      id: slot,
      category: SLOT_CATEGORY[slot] as "logic" | "security" | "smell" | "clean",
      file: p.file,
      edits: [{ file: p.file, find: p.find, replace: p.replace }],
      description: p.description,
      review: null,
    });
    placed.push({ slot, file: p.file, range });
  }

  return { findings, placed, issues };
}
