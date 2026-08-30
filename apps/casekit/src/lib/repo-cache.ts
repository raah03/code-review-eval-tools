import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RepoConfig } from "casekit-schema";
import { today } from "./date.js";
import { logger } from "logger";
import { git, repoMirrorPath } from "casekit-core";

const CLONE_DEPTH = "300";

/** doesn't run install/typecheck commands, those only mean something against a real candidate commit at gate time */
export function syncRepo(repo: RepoConfig): { syncedAt: string; syncedRef: string } {
  const mirror = repoMirrorPath(repo.id);

  if (!existsSync(mirror)) {
    logger.info(`${repo.id}: cloning into ${mirror}`);
    git(".", ["clone", "--depth", CLONE_DEPTH, "--single-branch", "--no-tags", repo.url, mirror]);
  } else {
    logger.info(`${repo.id}: updating existing mirror at ${mirror}`);
    git(mirror, ["fetch", "--depth", CLONE_DEPTH, "origin"]);
    git(mirror, ["reset", "--hard", "origin/HEAD"]);
  }

  if (!existsSync(join(mirror, repo.lockfilePath))) {
    throw new Error(
      `${repo.id}: lockfilePath "${repo.lockfilePath}" not found at HEAD of ${mirror}`,
    );
  }

  const syncedRef = git(mirror, ["rev-parse", "HEAD"]);
  return { syncedAt: today(), syncedRef };
}
