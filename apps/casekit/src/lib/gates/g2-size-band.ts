import type { GateContext } from "./context.js";

const BAND: [number, number] = [150, 450];

export function checkG2(ctx: GateContext): boolean {
  const value = ctx.meta.changed_lines_source_only;
  return value >= BAND[0] && value <= BAND[1];
}
