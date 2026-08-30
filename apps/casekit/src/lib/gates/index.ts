import type { CaseGates } from "casekit-schema";
import { logger } from "logger";
import { buildGateContext, type GateContext } from "./context.js";
import { checkG1 } from "./g1-typecheck.js";
import { checkG2 } from "./g2-size-band.js";
import { checkG3 } from "./g3-locations.js";
import { checkG4 } from "./g4-transitions.js";
import { checkG5 } from "./g5-overlap.js";
import { checkG6 } from "./g6-survivors.js";
import { checkG7 } from "./g7-reviewed.js";

function run(name: string, ctx: GateContext, check: (ctx: GateContext) => boolean): boolean {
  logger.debug(`running ${name}`);
  const result = check(ctx);
  logger[result ? "debug" : "warn"](`${name}: ${result ? "pass" : "FAIL"}`);
  return result;
}

export function runGates(datasetDir: string, caseId: string): CaseGates {
  logger.info(`${caseId}: materializing every iteration for content-match gates`);
  const ctx = buildGateContext(datasetDir, caseId);
  try {
    return {
      typecheck: run("G1", ctx, checkG1),
      sizeband: run("G2", ctx, checkG2),
      locations: run("G3", ctx, checkG3),
      transitions: run("G4", ctx, checkG4),
      disjoint: run("G5", ctx, checkG5),
      twoDefects: run("G6", ctx, checkG6),
      reviewed: run("G7", ctx, checkG7),
    };
  } finally {
    ctx.cleanup();
  }
}
