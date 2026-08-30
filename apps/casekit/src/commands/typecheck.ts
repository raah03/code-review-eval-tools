import type { Command } from "commander";
import { repoMirrorPath, requireRepoById } from "casekit-core";
import { logger } from "logger";
import { verifyTypecheck } from "../lib/typecheck/index.js";
import { createWorktree, destroyWorktree } from "../lib/worktree.js";
import type { DatasetDir } from "./shared.js";

interface TypecheckOpts {
  repo: string;
  ref: string;
}

export function registerTypecheck(program: Command, datasetDir: DatasetDir): void {
  program
    .command("typecheck")
    .description(
      "install + typecheck one ref of a repo in a throwaway worktree, the trial mine/inject both run internally",
    )
    .requiredOption("--repo <id>", "repo id from config/repos.yaml")
    .requiredOption("--ref <sha>", "commit to check out")
    .action((opts: TypecheckOpts) => {
      const dir = datasetDir();
      const repo = requireRepoById(dir, opts.repo);

      const mirror = repoMirrorPath(repo.id);
      const worktree = createWorktree(mirror, repo.id, opts.ref);
      try {
        const result = verifyTypecheck(worktree, repo, opts.ref);
        if (result.ok) {
          logger.info(`${repo.id}@${opts.ref.slice(0, 12)}: typechecks`);
        } else {
          logger.error(`${repo.id}@${opts.ref.slice(0, 12)}: failed\n${result.output}`);
          process.exit(1);
        }
      } finally {
        destroyWorktree(mirror, worktree);
      }
    });
}
