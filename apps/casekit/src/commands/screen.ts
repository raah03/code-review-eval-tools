import type { Command } from "commander";
import { createGitHubClient } from "../lib/github.js";
import { logger } from "logger";
import { positiveInt, ratio, screeningReportPath } from "casekit-core";
import {
  DEFAULT_THRESHOLDS,
  logScreeningSummary,
  screen,
  writeScreeningReport,
} from "../lib/screen/index.js";
import type { DatasetDir } from "./shared.js";

interface ScreenOpts {
  pool: number;
  repo: string[];
  out?: string;
  minStars: number;
  pushedWithinDays: number;
  maxSizeMb: number;
  commitSample: number;
  minProvenance: number;
  verifyProvenance: boolean;
}

export function registerScreen(program: Command, datasetDir: DatasetDir, envPath: string): void {
  program
    .command("screen")
    .description("screen GitHub for source repos against the mechanical repo-selection criteria")
    .option("--pool <n>", "how many of the top-starred matches to screen", positiveInt, 400)
    .option(
      "--repo <owner/name>",
      "screen these repos instead of taking a pool snapshot (repeatable)",
      (value: string, prev: string[]) => [...prev, value],
      [] as string[],
    )
    .option("--out <path>", "report path (default <dataset-dir>/screening/<today>.json)")
    .option("--min-stars <n>", "minimum stars", positiveInt, DEFAULT_THRESHOLDS.minStars)
    .option(
      "--pushed-within-days <n>",
      "days since last push allowed",
      positiveInt,
      DEFAULT_THRESHOLDS.pushedWithinDays,
    )
    .option(
      "--max-size-mb <n>",
      "git size ceiling in MB",
      positiveInt,
      DEFAULT_THRESHOLDS.maxSizeMb,
    )
    .option(
      "--commit-sample <n>",
      "commits sampled per repo for review-provenance",
      positiveInt,
      DEFAULT_THRESHOLDS.commitSample,
    )
    .option(
      "--min-provenance <ratio>",
      "minimum PR-linked ratio of the sampled commits",
      ratio,
      DEFAULT_THRESHOLDS.minPrLinkedRatio,
    )
    .option(
      "--no-verify-provenance",
      "reject on the commit-message heuristic alone, without confirming against the associated-PRs endpoint",
    )
    .action(async (opts: ScreenOpts) => {
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      const client = createGitHubClient(token);
      const budget = await client.budget();
      logger.info(
        budget.authenticated
          ? `github: authenticated, ${budget.core.remaining}/${budget.core.limit} core and ${budget.search.remaining}/${budget.search.limit} search requests left`
          : `github: no GITHUB_TOKEN in ${envPath}, running unauthenticated on ${budget.core.remaining}/${budget.core.limit} core requests`,
      );

      const report = await screen(client, {
        thresholds: {
          minStars: opts.minStars,
          pushedWithinDays: opts.pushedWithinDays,
          licenses: DEFAULT_THRESHOLDS.licenses,
          maxSizeMb: opts.maxSizeMb,
          commitSample: opts.commitSample,
          minPrLinkedRatio: opts.minProvenance,
        },
        poolSize: opts.pool,
        explicitRepos: opts.repo,
        verifyProvenance: opts.verifyProvenance,
        datasetDir: datasetDir(),
      });

      const out = opts.out ?? screeningReportPath(datasetDir(), report.screenedAt);
      writeScreeningReport(out, report);
      logScreeningSummary(report);
      logger.info(`wrote ${out}`);
    });
}
