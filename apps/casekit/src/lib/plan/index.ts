import type { IterationPlan } from "casekit-schema";
import { readInjections, readManifest, unacceptedFindings, writeInjections } from "casekit-core";
import { logger } from "logger";
import { chooseRevertPlan } from "./revert-assignment.js";

/** the only place deciding which 2 defects deactivate and in what order, deterministic from seed and case id */
export function planCase(datasetDir: string, caseId: string): void {
  const injections = readInjections(datasetDir, caseId);

  const cleanFinding = injections.findings.find((f) => f.category === "clean");
  if (!cleanFinding) {
    throw new Error(
      `${caseId}: no clean finding yet, run casekit inject --case ${caseId} --slot F5 first`,
    );
  }

  const unaccepted = unacceptedFindings(injections.findings);
  if (unaccepted.length > 0) {
    throw new Error(
      `${caseId}: not all findings are accepted yet (${unaccepted.map((f) => f.id).join(", ")})`,
    );
  }

  const seed = readManifest(datasetDir).seed;
  const defectIds = injections.findings.filter((f) => f.category !== "clean").map((f) => f.id);
  const [d1, d2] = chooseRevertPlan(seed, caseId, defectIds);
  logger.info(`${caseId}: revert plan ${d1}@i1, ${d2}@i2`);

  const i0Active = defectIds;
  const i1Active = i0Active.filter((id) => id !== d1);
  const i2Active = i1Active.filter((id) => id !== d2);

  const plan: IterationPlan[] = [
    { id: "i0", kind: "pull_request", active: i0Active },
    { id: "i1", kind: "fix", active: i1Active },
    { id: "i2", kind: "fix", active: i2Active },
    { id: "i3", kind: "cosmetic", active: [...i2Active, cleanFinding.id] },
  ];

  writeInjections(datasetDir, caseId, { ...injections, plan });
  logger.info(`${caseId}: plan frozen (${plan.map((it) => it.id).join(", ")})`);
}
