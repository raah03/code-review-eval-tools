import type { LineRange } from "casekit-schema";
import { rangesOverlap } from "diffkit";
import { logger } from "logger";
import type { GateContext } from "./context.js";

/** two findings sharing a line would make active edits ambiguous */
export function checkG5(ctx: GateContext): boolean {
  const byIteration = new Map<string, { id: string; file: string; lines: LineRange }[]>();
  for (const finding of ctx.meta.findings) {
    for (const [iterationId, location] of Object.entries(finding.locations)) {
      const list = byIteration.get(iterationId) ?? [];
      list.push({ id: finding.id, file: finding.file, lines: location.lines });
      byIteration.set(iterationId, list);
    }
  }

  for (const [iterationId, entries] of byIteration) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i] as (typeof entries)[number];
        const b = entries[j] as (typeof entries)[number];
        if (a.file !== b.file || !rangesOverlap(a.lines, b.lines)) continue;
        logger.warn(
          `G5: ${a.id} and ${b.id} overlap at ${iterationId} (${a.lines.join("-")} / ${b.lines.join("-")})`,
        );
        return false;
      }
    }
  }
  return true;
}
