import { execFileSync } from "node:child_process";
import { logger } from "logger";

/** trimmed, for shas and filenames where git's trailing newline isn't part of the value */
export function git(cwd: string, args: string[]): string {
  return gitRaw(cwd, args).trim();
}

/** untrimmed since trimming would corrupt content, maxBuffer raised past node's default for mine's git log */
export function gitRaw(cwd: string, args: string[]): string {
  logger.debug(`git ${args.join(" ")}  (cwd: ${cwd})`);
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 256 * 1_024 * 1_024 });
}

/** exact bytes at a ref, straight from the mirror, no worktree needed */
export function showFile(mirror: string, ref: string, path: string): string {
  return gitRaw(mirror, ["show", `${ref}:${path}`]);
}
