import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import {
  CandidateCommitSchema,
  MineReportSchema,
  type CandidateCommit,
  type MineCriterion,
  type MineReport,
  type MineThresholds,
  type ParentTypecheckStatus,
  type RepoConfig,
} from "casekit-schema";
import { today } from "../date.js";
import type { GitHubClient } from "../github.js";
import { logger } from "logger";
import { repoMirrorPath, requireOwnerRepo } from "casekit-core";
import { isChoreCommit, isDocsCommit, isRevertCommit } from "./commit-type.js";
import { computeDiffStats } from "./diff-stats.js";
import { ensureMinedHistory, listCommitsSince } from "./history.js";
import { isPrLinked } from "./pr-linked.js";
import { verifyTypecheck } from "../typecheck/index.js";
import { createWorktree, destroyWorktree, type Worktree } from "../worktree.js";

/** only reached after every cheaper filter passes */
function parentTypechecks(worktree: Worktree, repo: RepoConfig, parentSha: string): boolean {
  const result = verifyTypecheck(worktree, repo, parentSha);
  if (!result.ok) {
    logger.debug(
      `${repo.id}@${parentSha.slice(0, 12)}: typecheck failed, ${result.output.slice(0, 500)}`,
    );
  }
  return result.ok;
}

export interface MineOptions {
  thresholds: MineThresholds;
  /** false for --count-only, skips the typecheck trial and scans full history instead of stopping at limit */
  verifyTypechecks: boolean;
  /** stops phase a once this many commits survive, ignored when verifyTypechecks is false */
  limit?: number;
  /** pause after each typecheck attempt, ignored when verifyTypechecks is false */
  cooldownMs?: number;
}

/** survivor awaiting phase b, or a rejected commit kept for the audit trail */
interface CandidateDraft {
  commit: string;
  parent: string;
  authorDate: string;
  subject: string;
  changedLinesSourceOnly: number;
  linesAdded: number;
  linesRemoved: number;
  touchesSourceFileCount: number;
  failed: MineCriterion[];
  parentTypecheckStatus: ParentTypecheckStatus;
}

/** trusts the range between two passing endpoints, a failing one recurses instead since a repo
 *  can break then get fixed. g1 re-verifies everything later anyway */
async function verifyRange(
  worktree: Worktree,
  repo: RepoConfig,
  survivors: readonly CandidateDraft[],
  lo: number,
  hi: number,
  cooldownMs: number | undefined,
): Promise<void> {
  const verifyAt = async (i: number): Promise<boolean> => {
    const draft = survivors[i]!;
    if (draft.parentTypecheckStatus === "verified-pass") return true;
    if (draft.parentTypecheckStatus === "verified-fail") return false;
    logger.info(
      `mine: ${repo.id}: verifying typecheck at candidate ${i + 1}/${survivors.length} (${draft.commit.slice(0, 12)})`,
    );
    const pass = parentTypechecks(worktree, repo, draft.parent);
    draft.parentTypecheckStatus = pass ? "verified-pass" : "verified-fail";
    if (!pass) draft.failed.push("parentTypecheck");
    if (cooldownMs) await sleep(cooldownMs);
    return pass;
  };

  const loPass = await verifyAt(lo);
  const hiPass = lo === hi ? loPass : await verifyAt(hi);

  if (hi - lo <= 1) return; // adjacent or single, both endpoints already resolved

  if (loPass && hiPass) {
    for (let i = lo + 1; i < hi; i++) survivors[i]!.parentTypecheckStatus = "assumed-pass";
    return;
  }

  const mid = Math.floor((lo + hi) / 2);
  await verifyRange(worktree, repo, survivors, lo, mid, cooldownMs);
  await verifyRange(worktree, repo, survivors, mid, hi, cooldownMs);
}

/** cheapest checks first: subject, then diff, then pr api, then typecheck. a failing commit skips the rest */
export async function mineRepo(
  client: GitHubClient,
  repo: RepoConfig,
  options: MineOptions,
): Promise<MineReport> {
  const { thresholds, verifyTypechecks, limit, cooldownMs } = options;
  const mirror = repoMirrorPath(repo.id);
  const { owner, repo: repoName } = requireOwnerRepo(repo.url);

  ensureMinedHistory(mirror, repo.url, thresholds.trainingCutoffDate);
  const raw = listCommitsSince(mirror, thresholds.trainingCutoffDate);
  logger.info(
    `mine: ${repo.id}: ${raw.length} commit(s) authored since ${thresholds.trainingCutoffDate}`,
  );

  const drafts: CandidateDraft[] = [];
  const survivors: CandidateDraft[] = [];

  // phase a: cheapest-first filters, no typecheck
  for (const [index, commit] of raw.entries()) {
    if (verifyTypechecks && limit !== undefined && survivors.length >= limit) {
      logger.info(
        `mine: ${repo.id}: reached the limit of ${limit} cheap-filter survivors, stopping scan`,
      );
      break;
    }
    const isMerge = commit.parents.length > 1;
    const hasNoParent = commit.parents.length === 0;
    const parent = commit.parents[0] ?? commit.sha;
    const isRevert = isRevertCommit(commit.subject);
    const isChore = isChoreCommit(commit.subject);
    const isDocs = isDocsCommit(commit.subject);
    const failed: MineCriterion[] = [];
    if (isMerge) failed.push("merge");
    if (hasNoParent) failed.push("noParent");
    if (isRevert) failed.push("revert");
    if (isChore) failed.push("chore");
    if (isDocs) failed.push("docs");

    const skipDiff = failed.length > 0;
    const diffStats = skipDiff
      ? {
          changedLinesSourceOnly: 0,
          linesAdded: 0,
          linesRemoved: 0,
          touchesSourceFileCount: 0,
          isPureFormatting: false,
        }
      : computeDiffStats(mirror, parent, commit.sha);

    if (!skipDiff) {
      if (diffStats.isPureFormatting) failed.push("pureFormatting");
      if (
        diffStats.changedLinesSourceOnly < thresholds.minLines ||
        diffStats.changedLinesSourceOnly > thresholds.maxLines
      ) {
        failed.push("band");
      }
      if (diffStats.touchesSourceFileCount < thresholds.minSourceFiles) failed.push("fileCount");
    }

    if (failed.length === 0) {
      const prLinked = await isPrLinked(client, owner, repoName, commit.sha);
      if (!prLinked) failed.push("prLinked");
    }

    if (failed.length === 0) {
      logger.info(
        `mine: ${repo.id}: [${index + 1}/${raw.length}] ${commit.sha.slice(0, 12)} passed every cheap filter`,
      );
    }

    const draft: CandidateDraft = {
      commit: commit.sha,
      parent,
      authorDate: commit.authorDateIso.slice(0, 10),
      subject: commit.subject,
      changedLinesSourceOnly: diffStats.changedLinesSourceOnly,
      linesAdded: diffStats.linesAdded,
      linesRemoved: diffStats.linesRemoved,
      touchesSourceFileCount: diffStats.touchesSourceFileCount,
      failed,
      parentTypecheckStatus: "not-run",
    };
    drafts.push(draft);
    if (failed.length === 0 && verifyTypechecks) survivors.push(draft);
  }

  // phase b: bisecting typecheck verification over the collected survivors
  if (survivors.length > 0) {
    let worktree: Worktree | null = null;
    try {
      worktree = createWorktree(mirror, repo.id, survivors[0]!.parent);
      await verifyRange(worktree, repo, survivors, 0, survivors.length - 1, cooldownMs);
    } finally {
      if (worktree) destroyWorktree(mirror, worktree);
    }
  }

  const candidates = drafts.map((d) =>
    CandidateCommitSchema.parse({
      repo: repo.id,
      commit: d.commit,
      parent: d.parent,
      authorDate: d.authorDate,
      subject: d.subject,
      changedLinesSourceOnly: d.changedLinesSourceOnly,
      linesAdded: d.linesAdded,
      linesRemoved: d.linesRemoved,
      touchesSourceFileCount: d.touchesSourceFileCount,
      parentTypecheckStatus: d.parentTypecheckStatus,
      failed: d.failed,
      qualifies: d.failed.length === 0,
    } satisfies CandidateCommit),
  );

  return MineReportSchema.parse({
    minedAt: today(),
    repo: repo.id,
    thresholds,
    verifiedTypechecks: verifyTypechecks,
    candidates,
  } satisfies MineReport);
}

export function writeCandidates(path: string, report: MineReport): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${report.candidates.map((c) => JSON.stringify(c)).join("\n")}\n`);
}

export function logMineSummary(report: MineReport): void {
  const qualifying = report.candidates.filter((c) => c.qualifies);
  const rejections = new Map<MineCriterion, number>();
  for (const c of report.candidates) {
    for (const criterion of c.failed)
      rejections.set(criterion, (rejections.get(criterion) ?? 0) + 1);
  }
  const assumed = report.candidates.filter(
    (c) => c.parentTypecheckStatus === "assumed-pass",
  ).length;
  logger.info(
    `mine: ${report.repo}: ${qualifying.length}/${report.candidates.length} qualify` +
      (report.verifiedTypechecks
        ? assumed > 0
          ? ` (${assumed} assumed-pass via bisection, not individually typechecked)`
          : ""
        : " (typecheck not verified, count-only)"),
  );
  for (const [criterion, count] of rejections) logger.info(`  ${criterion}: ${count} rejected`);
}
