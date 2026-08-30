import { existsSync, readFileSync } from "node:fs";
import { CandidateCommitSchema, type CandidateCommit } from "casekit-schema";
import { candidatesPath } from "./paths.js";

/** doesn't exist until mine has run once, empty list not an error for no candidates yet */
export function readCandidates(datasetDir: string, repoId: string): CandidateCommit[] {
  const path = candidatesPath(datasetDir, repoId);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => CandidateCommitSchema.parse(JSON.parse(line)));
}
