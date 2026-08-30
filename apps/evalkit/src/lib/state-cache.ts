import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { caseDir, materialize } from "casekit-core";

/** materializes each case+state pair once per cell */
export class StateCache {
  private readonly scratch = mkdtempSync(join(tmpdir(), "evalkit-"));
  private readonly dirs = new Map<string, string>();

  constructor(private readonly datasetDir: string) {}

  dirFor(caseId: string, state: string): string {
    const key = `${caseId}@${state}`;
    const existing = this.dirs.get(key);
    if (existing) return existing;

    const dir = join(this.scratch, caseId, state);
    materialize(caseDir(this.datasetDir, caseId), state, dir, { datasetDir: this.datasetDir });
    this.dirs.set(key, dir);
    return dir;
  }

  cleanup(): void {
    rmSync(this.scratch, { recursive: true, force: true });
  }
}
