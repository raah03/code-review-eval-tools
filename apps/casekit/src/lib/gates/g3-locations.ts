import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "logger";
import { locateEdits } from "../locate.js";
import type { GateContext } from "./context.js";

/** matched by content not line numbrs, read straight from materialized files */
export function checkG3(ctx: GateContext): boolean {
  for (const findingMeta of ctx.meta.findings) {
    const finding = ctx.injections.findings.find((f) => f.id === findingMeta.id);
    if (!finding) {
      logger.warn(`G3: ${findingMeta.id} has no matching entry in injections.json`);
      return false;
    }

    for (const [iterationId, location] of Object.entries(findingMeta.locations)) {
      const content = readFileSync(
        join(ctx.stateDirs[iterationId] as string, findingMeta.file),
        "utf8",
      );
      let actual;
      try {
        actual = locateEdits(
          content,
          finding.edits,
          location.status === "active",
          `${finding.id}@${iterationId}`,
        );
      } catch {
        logger.warn(
          `G3: ${finding.id} at ${iterationId}: edit text not found in materialized file`,
        );
        return false;
      }
      if (actual[0] !== location.lines[0] || actual[1] !== location.lines[1]) {
        logger.warn(
          `G3: ${finding.id} at ${iterationId}: recorded ${location.lines.join("-")} does not match materialized content`,
        );
        return false;
      }
    }
  }
  return true;
}
