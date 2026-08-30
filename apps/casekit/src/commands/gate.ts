import type { Command } from "commander";
import { runGates } from "../lib/gates/index.js";
import { logger } from "logger";
import { writeCaseGates } from "casekit-core";
import { addCaseSelection, resolveCaseIds, type DatasetDir } from "./shared.js";

export function registerGate(program: Command, datasetDir: DatasetDir): void {
  addCaseSelection(
    program.command("gate").description("run gates G1-G7 and write evidence into MANIFEST.json"),
    "gate",
  ).action((opts: { case?: string; all?: boolean }) => {
    const dir = datasetDir();
    for (const caseId of resolveCaseIds(dir, opts, "gate")) {
      logger.info(`gating ${caseId}...`);
      const gates = runGates(dir, caseId);
      writeCaseGates(dir, caseId, gates);
      const failed = Object.entries(gates).filter(([, pass]) => !pass);
      logger.info(
        failed.length === 0
          ? `  ${caseId}: all gates pass`
          : `  ${caseId}: FAILED ${failed.map(([name]) => name).join(", ")}`,
      );
    }
  });
}
