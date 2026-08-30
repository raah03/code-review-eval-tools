import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "logger";
import { materialize, type State } from "casekit-core";
import { execOutput } from "../typecheck/index.js";
import type { GateContext } from "./context.js";

/** base plus every iteration, using the repo's own typecheckCommand, the actual gate not injector's pre-filter */
export function checkG1(ctx: GateContext): boolean {
  const STATES: readonly State[] = ["base", ...ctx.meta.iterations.map((it) => it.id)];
  const scratch = mkdtempSync(join(tmpdir(), "casekit-gate-g1-"));
  let failedState: State | undefined;

  try {
    for (const state of STATES) {
      failedState = state;
      const out = join(scratch, state);
      materialize(ctx.caseDir, state, out, { withDeps: true, datasetDir: ctx.datasetDir });
      logger.info(`G1: typechecking ${state}`);
      logger.debug(`${ctx.repo.typecheckCommand}  (cwd: ${out})`);
      execSync(ctx.repo.typecheckCommand, { cwd: out, stdio: "pipe" });
    }
    return true;
  } catch (error) {
    logger.warn(`G1: failed at ${failedState}`);
    const output = execOutput(error).trim();
    if (output) logger.debug(output);
    return false;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
