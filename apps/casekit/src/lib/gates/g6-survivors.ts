import type { GateContext } from "./context.js";

/** exactly 2 non-clean findings must survive to the final iteration */
export function checkG6(ctx: GateContext): boolean {
  const final = ctx.injections.plan?.at(-1);
  if (!final) return false;
  const survivors = ctx.meta.findings.filter(
    (f) => f.category !== "clean" && final.active.includes(f.id),
  ).length;
  return survivors === 2;
}
