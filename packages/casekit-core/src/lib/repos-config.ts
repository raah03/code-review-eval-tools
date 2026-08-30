import { readFileSync, writeFileSync } from "node:fs";
import { isMap, isSeq, parseDocument } from "yaml";
import { RepoRegistrySchema, type RepoConfig, type RepoRegistry } from "casekit-schema";
import { reposConfigPath } from "./paths.js";

export function readRepoRegistry(datasetDir: string): RepoRegistry {
  const raw = readFileSync(reposConfigPath(datasetDir), "utf8");
  return RepoRegistrySchema.parse(parseDocument(raw).toJS());
}

/** repos.yaml's slug, e.g. --repo <id> on the cli */
export function requireRepoById(datasetDir: string, id: string): RepoConfig {
  const repo = readRepoRegistry(datasetDir).repos.find((r) => r.id === id);
  if (!repo) throw new Error(`no repo "${id}" in ${reposConfigPath(datasetDir)}`);
  return repo;
}

/** every case-shaped file records provenance by url, never the repos.yaml slug */
export function requireRepoByUrl(datasetDir: string, url: string): RepoConfig {
  const repo = readRepoRegistry(datasetDir).repos.find((r) => r.url === url);
  if (!repo) throw new Error(`${url} is not in ${reposConfigPath(datasetDir)}`);
  return repo;
}

export interface SyncedFacts {
  id: string;
  syncedAt: string;
  syncedRef: string;
}

/** round-trip document api, a plain parse-mutate-stringify cycle would drop repos.yaml's comments */
export function writeSyncedFacts(datasetDir: string, facts: readonly SyncedFacts[]): void {
  const path = reposConfigPath(datasetDir);
  const doc = parseDocument(readFileSync(path, "utf8"));
  const repos = doc.get("repos");
  if (!isSeq(repos)) {
    throw new Error(`${path}: "repos" is not a sequence`);
  }

  for (const item of repos.items) {
    if (!isMap(item)) continue;
    const id = item.get("id");
    const match = facts.find((f) => f.id === id);
    if (!match) continue;
    item.set("syncedAt", match.syncedAt);
    item.set("syncedRef", match.syncedRef);
  }

  RepoRegistrySchema.parse(doc.toJS());
  writeFileSync(path, doc.toString());
}
