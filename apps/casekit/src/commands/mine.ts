import type { Command } from "commander";
import { candidatesPath, nonNegativeInt, positiveInt, requireRepoById } from "casekit-core";
import { logger } from "logger";
import { createGitHubClient } from "../lib/github.js";
import { logMineSummary, mineRepo, writeCandidates } from "../lib/mine/index.js";
import type { DatasetDir } from "./shared.js";

const DEFAULT_TRAINING_CUTOFF_DATE = "2026-01-01";
const DEFAULT_MIN_LINES = 150;
const DEFAULT_MAX_LINES = 450;
const DEFAULT_MIN_SOURCE_FILES = 2;
/** 3x the per-repo case ceiling, margin for injection/review/gate attrition without scanning full history */
const DEFAULT_LIMIT = 20;
const DEFAULT_COOLDOWN_SECONDS = 0;

interface MineOpts {
  repo: string;
  countOnly?: boolean;
  trainingCutoffDate: string;
  minLines: number;
  maxLines: number;
  minFiles: number;
  limit: number;
  cooldown: number;
  out?: string;
}

export function registerMine(program: Command, datasetDir: DatasetDir, envPath: string): void {
  program
    .command("mine")
    .description("mine a repo's post-cutoff commit history for case candidates")
    .requiredOption("--repo <id>", "repo id from config/repos.yaml")
    .option(
      "--count-only",
      "report band-eligible commit yield without running the install+typecheck trial",
    )
    .option(
      "--training-cutoff-date <date>",
      "only commits authored after this date qualify",
      DEFAULT_TRAINING_CUTOFF_DATE,
    )
    .option(
      "--min-lines <n>",
      "size band floor, non-test source lines",
      positiveInt,
      DEFAULT_MIN_LINES,
    )
    .option(
      "--max-lines <n>",
      "size band ceiling, non-test source lines",
      positiveInt,
      DEFAULT_MAX_LINES,
    )
    .option(
      "--min-files <n>",
      "minimum distinct source files touched",
      positiveInt,
      DEFAULT_MIN_SOURCE_FILES,
    )
    .option(
      "--limit <n>",
      "stop once this many candidates survive every cheap filter (band/fileCount/prLinked), " +
        "the typecheck trial then bisects that batch instead of checking every one " +
        "(ignored with --count-only)",
      positiveInt,
      DEFAULT_LIMIT,
    )
    .option(
      "--cooldown <seconds>",
      "pause this long after every actual install+typecheck attempt (ignored with --count-only)",
      nonNegativeInt,
      DEFAULT_COOLDOWN_SECONDS,
    )
    .option(
      "--out <path>",
      "candidates output path (default <dataset-dir>/candidates/<repo>.jsonl)",
    )
    .action(async (opts: MineOpts) => {
      const dir = datasetDir();
      const repo = requireRepoById(dir, opts.repo);

      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      const client = createGitHubClient(token);
      const budget = await client.budget();
      logger.info(
        budget.authenticated
          ? `github: authenticated, ${budget.core.remaining}/${budget.core.limit} core requests left`
          : `github: no GITHUB_TOKEN in ${envPath}, running unauthenticated on ${budget.core.remaining}/${budget.core.limit} core requests`,
      );

      const report = await mineRepo(client, repo, {
        thresholds: {
          minLines: opts.minLines,
          maxLines: opts.maxLines,
          minSourceFiles: opts.minFiles,
          trainingCutoffDate: opts.trainingCutoffDate,
        },
        verifyTypechecks: !opts.countOnly,
        limit: opts.limit,
        cooldownMs: opts.cooldown * 1_000,
      });

      logMineSummary(report);

      if (!opts.countOnly) {
        const out = opts.out ?? candidatesPath(dir, repo.id);
        writeCandidates(out, report);
        logger.info(`wrote ${out}`);
      }
    });
}
