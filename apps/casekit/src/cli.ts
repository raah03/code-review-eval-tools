#!/usr/bin/env node
import { Command } from "commander";
import { registerBuild } from "./commands/build.js";
import { registerGate } from "./commands/gate.js";
import { registerInject } from "./commands/inject.js";
import { registerMaterialize } from "./commands/materialize.js";
import { registerPlan } from "./commands/plan.js";
import { registerMine } from "./commands/mine.js";
import { registerRepos } from "./commands/repos.js";
import { registerScreen } from "./commands/screen.js";
import { registerTypecheck } from "./commands/typecheck.js";
import { loadWorkspaceEnv } from "casekit-core";
import { logger, setVerbose } from "logger";

const ENV_PATH = loadWorkspaceEnv();

const program = new Command("casekit")
  .option("--dataset-dir <path>", "dataset root (config/, cases/, MANIFEST.json)", process.cwd())
  .option("-v, --verbose", "show every subprocess command as it runs (git, install, typecheck)")
  .hook("preAction", (thisCommand) =>
    setVerbose(thisCommand.opts().verbose as boolean | undefined),
  );

const datasetDir = (): string => program.opts().datasetDir as string;

registerRepos(program, datasetDir);
registerScreen(program, datasetDir, ENV_PATH);
registerMine(program, datasetDir, ENV_PATH);
registerInject(program, datasetDir);
registerPlan(program, datasetDir);
registerBuild(program, datasetDir);
registerGate(program, datasetDir);
registerMaterialize(program, datasetDir);
registerTypecheck(program, datasetDir);

program.parseAsync(process.argv).catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
