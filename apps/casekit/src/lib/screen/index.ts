import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import {
  ScreenCriterionSchema,
  ScreenedRepoSchema,
  ScreeningReportSchema,
  type ScreenCriterion,
  type ScreenedRepo,
  type ScreeningReport,
  type ScreenThresholds,
} from "casekit-schema";
import { today } from "../date.js";
import type { GitHubClient } from "../github.js";
import { logger } from "logger";
import { readJson, screeningCachePath, writeJson } from "casekit-core";
import { gatherEvidence } from "./evidence.js";
import { fetchRepo, poolQuery, searchPool, type RepoMetadata } from "./pool.js";

export const DEFAULT_THRESHOLDS: ScreenThresholds = {
  minStars: 1_500,
  pushedWithinDays: 60,
  licenses: ["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"],
  maxSizeMb: 500,
  commitSample: 40,
  minPrLinkedRatio: 0.6,
};

/** decidable from pool metadata alone, runs first so rejects cost no fetch */
function screenMetadata(repo: RepoMetadata, thresholds: ScreenThresholds): ScreenCriterion[] {
  const failed: ScreenCriterion[] = [];
  const pushedAgeDays = (Date.now() - Date.parse(repo.pushedAt)) / 86_400_000;

  if (repo.language !== "TypeScript") failed.push("language");
  if (repo.stars < thresholds.minStars) failed.push("popularity");
  if (pushedAgeDays > thresholds.pushedWithinDays || repo.archived || repo.fork) {
    failed.push("activity");
  }
  if (!thresholds.licenses.includes(repo.licenseSpdxId ?? "")) failed.push("license");
  if (repo.sizeKb / 1_024 > thresholds.maxSizeMb) failed.push("size");

  return failed;
}

async function screenOne(
  client: GitHubClient,
  repo: RepoMetadata,
  thresholds: ScreenThresholds,
  verifyProvenance: boolean,
): Promise<ScreenedRepo> {
  const failed = screenMetadata(repo, thresholds);
  const evidence =
    failed.length > 0 ? null : await gatherEvidence(client, repo, thresholds, verifyProvenance);

  if (evidence) {
    if (evidence.lockfile === null) failed.push("lockfile");
    if (evidence.tsconfig === null) failed.push("tsconfig");
    if (evidence.prLinkedRatio < thresholds.minPrLinkedRatio) failed.push("provenance");
  }

  return {
    id: repo.fullName,
    url: repo.htmlUrl,
    primaryLanguage: repo.language,
    stars: repo.stars,
    pushedAt: repo.pushedAt,
    archived: repo.archived,
    fork: repo.fork,
    license: repo.licenseSpdxId,
    sizeMb: Math.round(repo.sizeKb / 102.4) / 10,
    defaultBranch: repo.defaultBranch,
    evidence,
    failed,
    pass: failed.length === 0,
  };
}

export interface ScreenOptions {
  thresholds: ScreenThresholds;
  poolSize: number;
  /** owner/name list, screens exactly these instead of a pool snapshot */
  explicitRepos: string[];
  verifyProvenance: boolean;
  datasetDir: string;
}

/** scopes the cache to the settings used, changing a threshold starts a fresh cache */
function configKey(thresholds: ScreenThresholds, verifyProvenance: boolean): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify({ thresholds, verifyProvenance }));
  return hash.digest("hex").slice(0, 12);
}

/** reads a cached decision if one exists, writes immediately so a crash loses at most one repo */
async function screenOneCached(
  client: GitHubClient,
  repo: RepoMetadata,
  thresholds: ScreenThresholds,
  verifyProvenance: boolean,
  cachePath: string,
): Promise<ScreenedRepo> {
  if (existsSync(cachePath)) {
    try {
      return readJson(ScreenedRepoSchema, cachePath);
    } catch {
      logger.warn(`screen: ${cachePath} is corrupt, re-screening ${repo.fullName}`);
    }
  }

  const result = await screenOne(client, repo, thresholds, verifyProvenance);
  writeJson(cachePath, result);
  return result;
}

/** snapshots the pool, only makes requests on metadata survivors */
export async function screen(
  client: GitHubClient,
  options: ScreenOptions,
): Promise<ScreeningReport> {
  const { thresholds, explicitRepos, poolSize, verifyProvenance, datasetDir } = options;
  const date = today();
  const cacheKey = configKey(thresholds, verifyProvenance);

  let repos: RepoMetadata[];
  let query: string;
  let totalCount: number;

  if (explicitRepos.length > 0) {
    query = `explicit: ${explicitRepos.join(", ")}`;
    const fetched = await Promise.all(explicitRepos.map((id) => fetchRepo(client, id)));
    fetched.forEach((repo, index) => {
      if (repo === null) logger.warn(`screen: no such repo ${explicitRepos[index]}`);
    });
    repos = fetched.filter((repo): repo is RepoMetadata => repo !== null);
    totalCount = repos.length;
  } else {
    query = poolQuery(thresholds);
    logger.info(`screen: query "${query}"`);
    const pool = await searchPool(client, query, poolSize);
    repos = pool.repos;
    totalCount = pool.totalCount;
  }

  const cached = repos.filter((repo) =>
    existsSync(screeningCachePath(datasetDir, date, cacheKey, repo.fullName)),
  ).length;
  if (cached > 0) {
    logger.info(`screen: resuming, ${cached}/${repos.length} repos already cached for today`);
  }

  const screened: ScreenedRepo[] = [];
  const failedRepos: string[] = [];
  for (const [index, repo] of repos.entries()) {
    const cachePath = screeningCachePath(datasetDir, date, cacheKey, repo.fullName);
    let result: ScreenedRepo;
    try {
      result = await screenOneCached(client, repo, thresholds, verifyProvenance, cachePath);
    } catch (error) {
      failedRepos.push(repo.fullName);
      logger.warn(
        `screen: ${repo.fullName} failed, skipping (rerun to retry): ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }
    screened.push(result);
    logger.debug(
      `screen: [${index + 1}/${repos.length}] ${result.id} ${result.pass ? "pass" : `fail ${result.failed.join(",")}`}`,
    );
    if (result.pass) logger.info(`screen: ${result.id} passes the mechanical screen`);
  }
  if (failedRepos.length > 0) {
    logger.warn(
      `screen: ${failedRepos.length} repos failed and were skipped: ${failedRepos.join(", ")}`,
    );
  }

  const rejections = Object.fromEntries(
    ScreenCriterionSchema.options.map((criterion) => [
      criterion,
      screened.filter((repo) => repo.failed.includes(criterion)).length,
    ]),
  ) as Record<ScreenCriterion, number>;

  return ScreeningReportSchema.parse({
    screenedAt: date,
    query,
    poolTotalCount: totalCount,
    poolRequested: explicitRepos.length > 0 ? explicitRepos.length : poolSize,
    poolReturned: repos.length,
    thresholds,
    rejections,
    survivors: screened.filter((repo) => repo.pass).map((repo) => repo.id),
    repos: screened,
  } satisfies ScreeningReport);
}

export function writeScreeningReport(path: string, report: ScreeningReport): void {
  writeJson(path, report);
}

export function logScreeningSummary(report: ScreeningReport): void {
  logger.info(`screened ${report.poolReturned} of ${report.poolTotalCount} matching repos`);
  for (const [criterion, count] of Object.entries(report.rejections)) {
    if (count > 0) logger.info(`  ${criterion}: ${count} rejected`);
  }
  logger.info(`survivors: ${report.survivors.length}`);
  for (const repo of report.repos.filter((r) => r.pass)) {
    logger.info(
      `  ${repo.id}: ${repo.stars} stars, ${repo.license}, ${repo.sizeMb} MB, ` +
        `${repo.evidence?.prLinkedCommits}/${repo.evidence?.commitsSampled} PR-linked, ` +
        `${repo.evidence?.mergeCommits} merge commits`,
    );
  }
}
