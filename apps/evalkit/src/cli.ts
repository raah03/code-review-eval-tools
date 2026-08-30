#!/usr/bin/env node
import { caseDir, float, loadWorkspaceEnv, positiveInt, readCaseMeta } from "casekit-core";
import { Command, Option } from "commander";
import { logger, setVerbose } from "logger";
import { EffortSchema, PROVIDER_API_KEY_ENV, ProviderSchema } from "model-client";
import { LineageError } from "reviewbot";
import { ArmSchema, buildGrid, type Arm } from "./lib/grid.js";
import { datasetVersion, harnessCommit } from "./lib/results.js";
import { runCell, type RunnerOptions } from "./lib/runner.js";
import { StateCache } from "./lib/state-cache.js";

loadWorkspaceEnv();

const program = new Command("evalkit")
  .description("run the review harness over built cases and persist one JSON artifact per call")
  .option("--dataset-dir <path>", "dataset root", process.cwd())
  .option("-v, --verbose", "show every cell as it runs")
  .hook("preAction", (thisCommand) =>
    setVerbose(thisCommand.opts().verbose as boolean | undefined),
  );

interface RunOptions {
  case: string[];
  arm: string;
  states: string;
  runs: number;
  provider: string;
  model: string;
  temperature: number;
  effort?: string;
  runId: string;
}

program
  .command("run")
  .description("run the grid: every (case, state, arm, run) cell is one API call")
  .requiredOption(
    "--case <id>",
    "case id (repeatable), the case list is what separates a development round from the benchmark grid",
    (value: string, prev: string[]) => [...prev, value],
    [] as string[],
  )
  .addOption(new Option("--arm <arm>", "baseline | middleware | both").default("baseline"))
  .option("--states <states>", "comma-separated iteration ids, in lineage order", "i0,i1,i2,i3")
  .option("--runs <n>", "repeated trials per cell", positiveInt, 1)
  .addOption(new Option("--provider <provider>", "openai | google | openrouter").default("google"))
  .requiredOption("--model <id>", "model id, no default, pin it explicitly per call")
  .option("--temperature <n>", "sampling temperature", float, 1)
  .addOption(
    new Option(
      "--effort <level>",
      "reasoning depth (default: provider/model default, Google: medium)",
    ).choices(EffortSchema.options),
  )
  .option(
    "--run-id <id>",
    "results/runs/<id>/..., reuse to resume, change for a fresh pass",
    "pilot",
  )
  .action(async (opts: RunOptions) => {
    const datasetDir = program.opts().datasetDir as string;
    const provider = ProviderSchema.parse(opts.provider);
    const effort = opts.effort ? EffortSchema.parse(opts.effort) : undefined;
    const arms: Arm[] =
      opts.arm === "both" ? ["baseline", "middleware"] : [ArmSchema.parse(opts.arm)];
    const grid = buildGrid(
      opts.case,
      opts.states.split(",").map((s) => s.trim()),
      arms,
      opts.runs,
    );

    // fail before spending anything if a case wasn't built
    for (const caseId of opts.case) readCaseMeta(caseDir(datasetDir, caseId));

    const apiKeyEnvVar = PROVIDER_API_KEY_ENV[provider];
    const apiKey = process.env[apiKeyEnvVar] ?? "";
    if (!apiKey) {
      logger.error(`${apiKeyEnvVar} is not set, add it to code-review-eval/.env`);
      process.exit(1);
    }

    const runnerOpts: RunnerOptions = {
      datasetDir,
      runId: opts.runId,
      model: {
        provider,
        apiKey,
        model: opts.model,
        temperature: opts.temperature,
        effort,
      },
      harnessCommit: harnessCommit(),
      datasetVersion: datasetVersion(datasetDir),
    };

    const cache = new StateCache(datasetDir);
    try {
      for (const cell of grid) await runCell(runnerOpts, cell, cache);
    } finally {
      cache.cleanup();
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  if (error instanceof LineageError) {
    logger.error(`lineage error, run aborted: ${error.message}`);
    process.exit(2);
  }
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
