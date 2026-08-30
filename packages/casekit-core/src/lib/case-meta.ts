import { join } from "node:path";
import { CaseMetaSchema, type CaseMeta } from "casekit-schema";
import { readJson } from "./json.js";

export function readCaseMeta(oneCaseDir: string): CaseMeta {
  return readJson(CaseMetaSchema, join(oneCaseDir, "pr", "meta.json"));
}
