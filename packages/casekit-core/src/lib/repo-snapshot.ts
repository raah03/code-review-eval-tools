import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { Source } from "casekit-schema";
import { logger } from "logger";
import { caseDir, repoMirrorPath } from "./paths.js";
import { requireRepoByUrl } from "./repos-config.js";

/** restores gitignored repo/ from the mirror if missing, a no-op otherwise so callers can call this unconditionally */
export function ensureRepoSnapshot(
  datasetDir: string,
  caseId: string,
  source: Pick<Source, "repo" | "base_commit">,
): void {
  const repoDir = join(caseDir(datasetDir, caseId), "repo");
  if (existsSync(repoDir)) return;

  const repo = requireRepoByUrl(datasetDir, source.repo);
  const mirror = repoMirrorPath(repo.id);
  logger.info(
    `${caseId}: repo/ missing, restoring @ ${source.base_commit.slice(0, 12)} from mirror`,
  );

  mkdirSync(repoDir, { recursive: true });
  try {
    const tar = execFileSync("git", ["archive", "--format=tar", source.base_commit], {
      cwd: mirror,
      maxBuffer: 512 * 1_024 * 1_024,
    });
    execFileSync("tar", ["-x", "-C", repoDir], { input: tar });
  } catch (error) {
    rmSync(repoDir, { recursive: true, force: true });
    throw new Error(
      `${caseId}: could not restore repo/ from mirror at ${mirror} @ ${source.base_commit}, ` +
        `if the mirror is missing or too shallow, run casekit repos sync --repo ${repo.id} first. (${error})`,
    );
  }
}
