import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "casekit-core";

export interface Worktree {
  path: string;
}

export function createWorktree(mirror: string, repoId: string, initialSha: string): Worktree {
  const path = mkdtempSync(join(tmpdir(), `casekit-${repoId}-`));
  git(mirror, ["worktree", "add", "--detach", "--force", path, initialSha]);
  return { path };
}

export function destroyWorktree(mirror: string, worktree: Worktree): void {
  try {
    git(mirror, ["worktree", "remove", "--force", worktree.path]);
  } catch {
    rmSync(worktree.path, { recursive: true, force: true });
    try {
      git(mirror, ["worktree", "prune"]);
    } catch {
      // TOOD: force cleanup, otherwise /tmp will filled with state files
    }
  }
}
