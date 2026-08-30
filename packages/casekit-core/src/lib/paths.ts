import { homedir } from "node:os";
import { join } from "node:path";

/** outside the dataset and git, shared across dataset-sample and dataset, overridable for tests */
export function repoCacheRoot(): string {
  return process.env.CASEKIT_REPO_CACHE_DIR ?? join(homedir(), ".cache", "casekit", "repos");
}

export function repoMirrorPath(repoId: string): string {
  return join(repoCacheRoot(), repoId);
}

export function reposConfigPath(datasetDir: string): string {
  return join(datasetDir, "config", "repos.yaml");
}

/** one dated file per run, snapshots accumulate rather than overwrite */
export function screeningReportPath(datasetDir: string, date: string): string {
  return join(datasetDir, "screening", `${date}.json`);
}

/** written per repo as soon as decided, so a crash loses nothing. configKey
 *  scopes it to the thresholds used */
export function screeningCachePath(
  datasetDir: string,
  date: string,
  configKey: string,
  repoId: string,
): string {
  return join(datasetDir, "screening", date, configKey, `${repoId.replace("/", "__")}.json`);
}

/** casekit mine's output, overwritten wholesale each run unlike screening's dated snapshots */
export function candidatesPath(datasetDir: string, repoId: string): string {
  return join(datasetDir, "candidates", `${repoId}.jsonl`);
}

/** casekit build output, never hand-authored */
export function caseDir(datasetDir: string, caseId: string): string {
  return join(datasetDir, "cases", caseId);
}

/** kept outside cases/<id> so that directory stays safe to delete and rebuild */
export function injectionsPath(datasetDir: string, caseId: string): string {
  return join(datasetDir, "injections", `${caseId}.json`);
}
