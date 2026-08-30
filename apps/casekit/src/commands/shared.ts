import { Command, Option } from "commander";
import { readManifest } from "casekit-core";
import { logger } from "logger";

export type DatasetDir = () => string;

/** the --case/--all pair plan, build, and gate all commands needs */
export function addCaseSelection(command: Command, verb: string): Command {
  return command
    .addOption(new Option("--case <id>", "case id").conflicts("all"))
    .addOption(new Option("--all", `${verb} every case`).conflicts("case"));
}

/** resolves what addCaseSelection adds into concrete case ids */
export function resolveCaseIds(
  dir: string,
  opts: { case?: string; all?: boolean },
  verb: string,
): string[] {
  if (!opts.case && !opts.all) {
    logger.error(`${verb}: pass --case <id> or --all`);
    process.exit(1);
  }
  return opts.all ? readManifest(dir).cases.map((c) => c.id) : [opts.case as string];
}
