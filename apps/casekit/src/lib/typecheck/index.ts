import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Edit, RepoConfig } from "casekit-schema";
import { applyEdit } from "../build/replay.js";
import { git } from "casekit-core";
import { logger } from "logger";
import type { Worktree } from "../worktree.js";

export interface TypecheckResult {
  ok: boolean;
  output: string;
}

export function execOutput(error: unknown): string {
  if (error && typeof error === "object" && "stdout" in error) {
    const e = error as { stdout?: Buffer | string; stderr?: Buffer | string; message: string };
    const out = [e.stdout, e.stderr].filter(Boolean).map(String).join("\n").trim();
    return out.length > 0 ? out : e.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex").slice(0, 16);
}

/** reused across the pipeline, lockfile hash is cached in the worktree to avoid a repeated slow install */
export function verifyTypecheck(
  worktree: Worktree,
  repo: RepoConfig,
  ref: string,
  edits: readonly Edit[] = [],
): TypecheckResult {
  try {
    git(worktree.path, ["checkout", "--detach", "--force", ref]);
    for (const edit of edits) {
      const path = join(worktree.path, edit.file);
      const content = readFileSync(path, "utf8");
      writeFileSync(path, applyEdit(content, edit.find, edit.replace, edit.file));
    }
    const lockfilePath = join(worktree.path, repo.lockfilePath);
    const lockfileHash = hashFile(lockfilePath);
    const cacheMarker = join(worktree.path, ".casekit-lockfile-hash");
    let needsInstall = true;
    if (existsSync(cacheMarker)) {
      const cachedHash = readFileSync(cacheMarker, "utf8");
      if (cachedHash === lockfileHash && existsSync(join(worktree.path, "node_modules"))) {
        needsInstall = false;
      }
    }
    if (needsInstall) {
      logger.debug(`installing dependencies: ${repo.installCommand}  (cwd: ${worktree.path})`);
      execSync(repo.installCommand, { cwd: worktree.path, stdio: "pipe" });
      writeFileSync(cacheMarker, lockfileHash);
    }
    logger.debug(`${repo.typecheckCommand}  (cwd: ${worktree.path})`);
    execSync(repo.typecheckCommand, { cwd: worktree.path, stdio: "pipe" });
    return { ok: true, output: "" };
  } catch (error) {
    return { ok: false, output: execOutput(error) };
  }
}
