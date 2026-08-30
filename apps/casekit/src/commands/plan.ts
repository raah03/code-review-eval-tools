import type { Command } from "commander";
import { planCase } from "../lib/plan/index.js";
import { addCaseSelection, resolveCaseIds, type DatasetDir } from "./shared.js";

export function registerPlan(program: Command, datasetDir: DatasetDir): void {
  addCaseSelection(
    program
      .command("plan")
      .description(
        "freeze which findings are active in which iteration, once the clean finding (F5) is generated and accepted like any other",
      ),
    "plan",
  ).action((opts: { case?: string; all?: boolean }) => {
    const dir = datasetDir();
    for (const caseId of resolveCaseIds(dir, opts, "plan")) planCase(dir, caseId);
  });
}
