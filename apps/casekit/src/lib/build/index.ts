import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CaseMeta, IterationPlan, Iteration, Location } from "casekit-schema";
import { CaseMetaSchema } from "casekit-schema";
import {
  caseDir,
  ensureRepoSnapshot,
  git,
  gitRaw,
  readInjections,
  repoMirrorPath,
  requireRepoByUrl,
  showFile,
  writeJsonValidated,
} from "casekit-core";
import { logger } from "logger";
import { locateEdits } from "../locate.js";
import { isSourceFile } from "../mine/classify.js";
import { replayFindings } from "./replay.js";

/** restricted to isSourceFile paths for g2 size band */
function numstatTotal(mirror: string, commit: string): number {
  return git(mirror, ["show", "--numstat", "--format=", commit])
    .split("\n")
    .filter(Boolean)
    .reduce((sum, line) => {
      const [added, deleted, path] = line.split("\t");
      if (!path || !isSourceFile(path)) return sum;
      return (
        sum + (Number.parseInt(added ?? "0", 10) || 0) + (Number.parseInt(deleted ?? "0", 10) || 0)
      );
    }, 0);
}

/** case which has no plan and needs a preview plan to be reviewed */
function previewPlan(findingIds: readonly string[]): IterationPlan[] {
  return [{ id: "i0", kind: "pull_request", active: [...findingIds] }];
}

/** derives meta.json and files/<iteration> from injections */
export function buildCase(datasetDir: string, caseId: string): void {
  const oneCaseDir = caseDir(datasetDir, caseId);
  const injections = readInjections(datasetDir, caseId);
  ensureRepoSnapshot(datasetDir, caseId, injections.source);
  const plan = injections.plan ?? previewPlan(injections.findings.map((f) => f.id));
  if (!injections.plan) {
    logger.info(
      `${caseId}: no plan recorded yet, building an unreviewed preview (i0, every finding active), rebuild after casekit plan --case ${caseId} for the real plan`,
    );
  }

  const repo = requireRepoByUrl(datasetDir, injections.source.repo);
  const mirror = repoMirrorPath(repo.id);
  const findingFiles = [...new Set(injections.findings.map((f) => f.file))];

  logger.info(`${caseId}: replaying ${plan.map((it) => it.id).join("..")}`);

  const touchedFiles = git(mirror, ["show", "--name-only", "--format=", injections.source.commit])
    .split("\n")
    .filter(Boolean);
  const deletedFiles = gitRaw(mirror, [
    "show",
    "--name-status",
    "--format=",
    injections.source.commit,
  ])
    .split("\n")
    .filter((l) => l.startsWith("D\t"))
    .map((l) => l.slice(2));
  const otherFiles = touchedFiles.filter(
    (f) => !findingFiles.includes(f) && !deletedFiles.includes(f),
  );

  const contentAtCommit = new Map(
    [...findingFiles, ...otherFiles].map((file) => [
      file,
      showFile(mirror, injections.source.commit, file),
    ]),
  );

  const snapshots = new Map(
    plan.map((it) => [it.id, replayFindings(contentAtCommit, injections.findings, it.active)]),
  );

  const filesDir = join(oneCaseDir, "pr", "files");
  rmSync(filesDir, { recursive: true, force: true });
  const writeOverlay = (iterationId: string, files: readonly string[]) => {
    const content = snapshots.get(iterationId) as Map<string, string>;
    for (const file of files) {
      const dest = join(filesDir, iterationId, file);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, content.get(file) ?? "");
    }
  };

  const iterations: Iteration[] = plan.map((it, index) => {
    const content = snapshots.get(it.id) as Map<string, string>;
    const changedFiles =
      index === 0
        ? [...findingFiles, ...otherFiles].sort()
        : [...content.keys()]
            .filter(
              (file) => content.get(file) !== snapshots.get(plan[index - 1]?.id ?? "")?.get(file),
            )
            .sort();
    writeOverlay(it.id, changedFiles);
    return {
      id: it.id,
      kind: it.kind,
      active: it.active,
      changed_files: changedFiles,
      review_files: changedFiles.filter(isSourceFile),
      deleted: index === 0 ? deletedFiles : [],
    };
  });

  // resolve every finding's location in every iteration, by content match
  const findings = injections.findings.map((finding) => {
    const locations: Record<string, Location> = {};
    for (const it of plan) {
      const content = snapshots.get(it.id)?.get(finding.file);
      if (content === undefined) {
        throw new Error(`${finding.id}: ${finding.file} has no tracked content at ${it.id}`);
      }
      const active = it.active.includes(finding.id);
      locations[it.id] = {
        status: active ? "active" : "inactive",
        lines: locateEdits(content, finding.edits, active, `${it.id} (${finding.id})`),
      };
    }
    return { id: finding.id, category: finding.category, file: finding.file, locations };
  });

  const meta: CaseMeta = {
    id: caseId,
    source: injections.source,
    language: "typescript",
    changed_lines_source_only: numstatTotal(mirror, injections.source.commit),
    iterations,
    findings,
  };

  writeJsonValidated(join(oneCaseDir, "pr", "meta.json"), CaseMetaSchema, meta);
  logger.info(
    `${caseId}: built (${plan.map((it) => `${it.id}: ${it.active.length} active`).join(", ")})`,
  );
}
