import type { Command } from "commander";
import { buildCase } from "../lib/build/index.js";
import { addCaseSelection, resolveCaseIds, type DatasetDir } from "./shared.js";

export function registerBuild(program: Command, datasetDir: DatasetDir): void {
  addCaseSelection(
    program.command("build").description("derive meta.json and files/** from injections.json"),
    "build",
  ).action((opts: { case?: string; all?: boolean }) => {
    const dir = datasetDir();
    for (const caseId of resolveCaseIds(dir, opts, "build")) buildCase(dir, caseId);
  });
}
