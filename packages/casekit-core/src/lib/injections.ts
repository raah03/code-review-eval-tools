import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CaseIdSchema,
  InjectionsSchema,
  SourceSchema,
  type Finding,
  type Injections,
  type Source,
} from "casekit-schema";
import { readJson, readJsonRaw, writeJson, writeJsonValidated } from "./json.js";
import { injectionsPath } from "./paths.js";

/** everything still needing accept for g7, clean findings included */
export function unacceptedFindings(findings: readonly Finding[]): Finding[] {
  return findings.filter((f) => f.review?.verdict !== "accept");
}

export function readInjections(datasetDir: string, caseId: string): Injections {
  return readJson(InjectionsSchema, injectionsPath(datasetDir, caseId));
}

export function writeInjections(datasetDir: string, caseId: string, injections: Injections): void {
  writeJsonValidated(injectionsPath(datasetDir, caseId), InjectionsSchema, injections);
}

const CASE_ID_FILE_RE = /^case-(\d{3})\.json$/;

function existingCaseIdNumbers(datasetDir: string): number[] {
  const dir = join(datasetDir, "injections");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => CASE_ID_FILE_RE.exec(name)?.[1])
    .filter((n): n is string => n !== undefined)
    .map(Number);
}

/** scans injections/ since cases/ doesn't exist until build has run */
export function nextCaseId(datasetDir: string): string {
  const max = existingCaseIdNumbers(datasetDir).reduce((highest, n) => Math.max(highest, n), 0);
  return `case-${String(max + 1).padStart(3, "0")}`;
}

/** promoting the same candidate twice must return the existing case not a duplicate */
export function findCaseIdForCommit(datasetDir: string, commit: string): string | null {
  const dir = join(datasetDir, "injections");
  if (!existsSync(dir)) return null;
  for (const name of readdirSync(dir)) {
    if (!CASE_ID_FILE_RE.test(name)) continue;
    const raw = readJsonRaw(join(dir, name)) as { source?: { commit?: string } };
    if (raw.source?.commit === commit) return name.replace(/\.json$/, "");
  }
  return null;
}

/** bypasses InjectionsSchema on purpose, schema-invalid until casekit inject fills it in */
export function seedInjections(datasetDir: string, caseId: string, source: Source): void {
  CaseIdSchema.parse(caseId);
  SourceSchema.parse(source);
  writeJson(injectionsPath(datasetDir, caseId), { case_id: caseId, source });
}

/** read-modify-write through writeInjections keeps one place deciding the file is well-formed */
export function setFindingReview(
  datasetDir: string,
  caseId: string,
  findingId: string,
  review: Finding["review"],
): Injections {
  const current = readInjections(datasetDir, caseId);
  if (!current.findings.some((f) => f.id === findingId)) {
    throw new Error(`${caseId}: no finding ${findingId}`);
  }
  const next: Injections = {
    ...current,
    findings: current.findings.map((f) => (f.id === findingId ? { ...f, review } : f)),
  };
  writeInjections(datasetDir, caseId, next);
  return next;
}
