import { join } from "node:path";
import {
  CaseGatesSchema,
  ManifestSchema,
  type CaseGates,
  type Manifest,
  type RepoConfig,
} from "casekit-schema";
import { readJson, writeJsonValidated } from "./json.js";

export function manifestPath(datasetDir: string): string {
  return join(datasetDir, "MANIFEST.json");
}

export function readManifest(datasetDir: string): Manifest {
  return readJson(ManifestSchema, manifestPath(datasetDir));
}

/** updates one case's gates in place, everything else in the manifest stays untouched */
export function writeCaseGates(datasetDir: string, caseId: string, gates: CaseGates): void {
  const manifest = readManifest(datasetDir);
  const entry = manifest.cases.find((c) => c.id === caseId);
  if (!entry) {
    throw new Error(`${caseId} is not in ${manifestPath(datasetDir)}`);
  }
  entry.gates = gates;

  writeJsonValidated(manifestPath(datasetDir), ManifestSchema, manifest);
}

/** recorded false not omitted, since CaseGatesSchema requires all seven present */
function pendingGates(): CaseGates {
  return CaseGatesSchema.parse({
    typecheck: false,
    sizeband: false,
    locations: false,
    transitions: false,
    disjoint: false,
    twoDefects: false,
    reviewed: false,
  });
}

/** idempotent, backfills repositories[] since the schema requires every case's repo listed */
export function registerCase(datasetDir: string, caseId: string, repo: RepoConfig): void {
  const manifest = readManifest(datasetDir);
  if (manifest.cases.some((c) => c.id === caseId)) return;
  if (!manifest.repositories.some((r) => r.repo === repo.url)) {
    manifest.repositories.push({
      repo: repo.url,
      license: repo.license,
      attribution: repo.attribution,
    });
  }
  manifest.cases.push({ id: caseId, repo: repo.url, gates: pendingGates() });
  writeJsonValidated(manifestPath(datasetDir), ManifestSchema, manifest);
}
