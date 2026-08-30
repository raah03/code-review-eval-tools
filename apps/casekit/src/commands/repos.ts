import type { Command } from "commander";
import { logger } from "logger";
import { syncRepo } from "../lib/repo-cache.js";
import { readRepoRegistry, writeSyncedFacts, type SyncedFacts } from "casekit-core";
import type { DatasetDir } from "./shared.js";

export function registerRepos(program: Command, datasetDir: DatasetDir): void {
  program
    .command("repos")
    .description("manage the repo cache")
    .command("sync")
    .description("sync mirrors into the repo cache")
    .option("--repo <id>", "sync only this repo")
    .action((opts: { repo?: string }) => {
      const dir = datasetDir();
      const registry = readRepoRegistry(dir);
      const targets = opts.repo ? registry.repos.filter((r) => r.id === opts.repo) : registry.repos;
      if (opts.repo && targets.length === 0) {
        logger.error(`no repo "${opts.repo}" in ${dir}/config/repos.yaml`);
        process.exit(1);
      }

      const facts: SyncedFacts[] = [];
      for (const repo of targets) {
        logger.info(`syncing ${repo.id}...`);
        const { syncedAt, syncedRef } = syncRepo(repo);
        facts.push({ id: repo.id, syncedAt, syncedRef });
        logger.info(`  ${repo.id} @ ${syncedRef.slice(0, 12)} (${syncedAt})`);
      }
      writeSyncedFacts(dir, facts);
    });
}
