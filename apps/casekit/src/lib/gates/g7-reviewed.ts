import { unacceptedFindings } from "casekit-core";
import { logger } from "logger";
import type { GateContext } from "./context.js";

export function checkG7(ctx: GateContext): boolean {
  const unaccepted = unacceptedFindings(ctx.injections.findings);
  if (unaccepted.length > 0) {
    logger.warn(`G7: not accepted: ${unaccepted.map((f) => f.id).join(", ")}`);
    return false;
  }
  return true;
}
