import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CaseMeta, Injections, RepoConfig } from "casekit-schema";
import { caseDir, materialize, readCaseMeta, readInjections, requireRepoByUrl } from "casekit-core";

export interface GateContext {
  datasetDir: string;
  caseDir: string;
  repo: RepoConfig;
  meta: CaseMeta;
  injections: Injections;
  /** materialized without deps, cheap and shared by g3/g4/g5. g1 needs deps so it materializes its own copies */
  stateDirs: Record<string, string>;
  cleanup(): void;
}

export function buildGateContext(datasetDir: string, caseId: string): GateContext {
  const oneCaseDir = caseDir(datasetDir, caseId);
  const meta = readCaseMeta(oneCaseDir);
  const injections = readInjections(datasetDir, caseId);
  const repo = requireRepoByUrl(datasetDir, meta.source.repo);

  const scratch = mkdtempSync(join(tmpdir(), "casekit-gate-"));
  const stateDirs: Record<string, string> = {};
  for (const iteration of meta.iterations) {
    const out = join(scratch, iteration.id);
    materialize(oneCaseDir, iteration.id, out);
    stateDirs[iteration.id] = out;
  }

  return {
    datasetDir,
    caseDir: oneCaseDir,
    repo,
    meta,
    injections,
    stateDirs,
    cleanup: () => rmSync(scratch, { recursive: true, force: true }),
  };
}
