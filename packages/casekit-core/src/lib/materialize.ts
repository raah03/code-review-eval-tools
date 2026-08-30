import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { logger } from "logger";
import { readCaseMeta } from "./case-meta.js";
import { ensureRepoSnapshot } from "./repo-snapshot.js";
import { requireRepoByUrl } from "./repos-config.js";

/** base, or any iteration id, casekit doesn't know valid ids in advance */
export type State = string;

export interface MaterializeOptions {
  /** installs deps in the output dir, needs datasetDir to find the repo */
  withDeps?: boolean;
  datasetDir?: string;
}

/** overlay not patch, copies repo/ then applies iterations up to state.
 *  repo/ is gitignored, needs datasetDir to restore it */
export function materialize(
  oneCaseDir: string,
  state: State,
  outDir: string,
  options: MaterializeOptions = {},
): void {
  const repoDir = join(oneCaseDir, "repo");
  const meta = readCaseMeta(oneCaseDir);

  if (options.datasetDir) {
    ensureRepoSnapshot(options.datasetDir, basename(oneCaseDir), meta.source);
  } else if (!existsSync(repoDir)) {
    throw new Error(
      `${repoDir} does not exist and no datasetDir was given to restore it, pass datasetDir, or restore it manually first.`,
    );
  }

  if (state !== "base" && !meta.iterations.some((it) => it.id === state)) {
    throw new Error(
      `${state} is not a known state for ${basename(oneCaseDir)}, expected "base" or one of ` +
        meta.iterations.map((it) => it.id).join(", "),
    );
  }
  logger.debug(`materializing ${basename(oneCaseDir)} @ ${state} -> ${outDir}`);

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  cpSync(repoDir, outDir, { recursive: true });

  if (state !== "base") {
    const targetIndex = meta.iterations.findIndex((it) => it.id === state);
    for (const iteration of meta.iterations) {
      if (meta.iterations.indexOf(iteration) > targetIndex) break;

      const overlayDir = join(oneCaseDir, "pr", "files", iteration.id);
      for (const file of iteration.changed_files) {
        const dest = join(outDir, file);
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(join(overlayDir, file), dest);
      }
      for (const deletedFile of iteration.deleted) {
        rmSync(join(outDir, deletedFile), { force: true });
      }
    }
  }

  if (options.withDeps) {
    if (!options.datasetDir) {
      throw new Error("materialize: withDeps requires datasetDir (to look up config/repos.yaml)");
    }
    const repo = requireRepoByUrl(options.datasetDir, meta.source.repo);
    // repo/ has no .git, some install pipelines run a prepare script that shells out to git
    execSync("git init", { cwd: outDir, stdio: "pipe" });
    logger.debug(`installing dependencies: ${repo.installCommand}  (cwd: ${outDir})`);
    execSync(repo.installCommand, { cwd: outDir, stdio: "pipe" });
  }
}
