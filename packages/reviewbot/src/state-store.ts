import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { FindingSchema, type Finding, type StateStore } from "./types.js";

const SnapshotSchema = z.object({ findings: z.array(FindingSchema) });

/** becomes a path segment, can't escape the root. slashes allowed so callers can nest naturally */
function segment(value: string, what: string): string {
  if (value.length === 0 || value.startsWith("/") || value.split("/").includes("..")) {
    throw new Error(`invalid ${what}: ${JSON.stringify(value)}`);
  }
  return value;
}

/** one file per round at root/lineage/step.json */
export class FileStateStore implements StateStore {
  constructor(private readonly root: string) {}

  private path(lineageId: string, step: string): string {
    return join(this.root, segment(lineageId, "lineage id"), `${segment(step, "step")}.json`);
  }

  load(lineageId: string, step: string): Finding[] | null {
    const path = this.path(lineageId, step);
    if (!existsSync(path)) return null;
    return SnapshotSchema.parse(JSON.parse(readFileSync(path, "utf8"))).findings;
  }

  save(lineageId: string, step: string, findings: Finding[]): void {
    const path = this.path(lineageId, step);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ findings }, null, 2)}\n`);
  }
}
