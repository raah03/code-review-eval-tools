import type { Command } from "commander";
import { caseDir, materialize } from "casekit-core";
import type { DatasetDir } from "./shared.js";

export function registerMaterialize(program: Command, datasetDir: DatasetDir): void {
  program
    .command("materialize")
    .description("materialize one state of a case to a directory")
    .requiredOption("--case <id>", "case id")
    .requiredOption(
      "--state <state>",
      "state to materialize (base, or an iteration id from meta.json)",
    )
    .requiredOption("--out <dir>", "output directory")
    .option("--with-deps", "symlink a cached node_modules into the output dir")
    .action((opts: { case: string; state: string; out: string; withDeps?: boolean }) => {
      const dir = datasetDir();
      materialize(caseDir(dir, opts.case), opts.state, opts.out, {
        withDeps: opts.withDeps,
        datasetDir: dir,
      });
    });
}
