import { readFileSync } from "node:fs";
import { join } from "node:path";
import { logger } from "logger";
import { applyEdit } from "../build/replay.js";
import type { GateContext } from "./context.js";

/** stronger than g3, confirms a flipping finding changes only its own edits' span */
export function checkG4(ctx: GateContext): boolean {
  const plan = ctx.injections.plan;
  if (!plan) {
    logger.warn("G4: no plan recorded");
    return false;
  }

  for (let i = 1; i < plan.length; i++) {
    const prev = plan[i - 1] as (typeof plan)[number];
    const cur = plan[i] as (typeof plan)[number];

    for (const finding of ctx.injections.findings) {
      const wasActive = prev.active.includes(finding.id);
      const isActive = cur.active.includes(finding.id);
      if (wasActive === isActive) continue;

      const before = readFileSync(join(ctx.stateDirs[prev.id] as string, finding.file), "utf8");
      const after = readFileSync(join(ctx.stateDirs[cur.id] as string, finding.file), "utf8");

      let expected = before;
      try {
        for (const edit of finding.edits) {
          const [find, replace] = isActive ? [edit.find, edit.replace] : [edit.replace, edit.find];
          expected = applyEdit(expected, find, replace, `${finding.id} ${prev.id}->${cur.id}`);
        }
      } catch {
        logger.warn(`G4: ${finding.id}: could not apply its own edits going ${prev.id}->${cur.id}`);
        return false;
      }
      if (expected !== after) {
        logger.warn(`G4: ${finding.id}: ${prev.id}->${cur.id} changed more than its own edits`);
        return false;
      }
    }
  }
  return true;
}
