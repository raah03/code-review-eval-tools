import { existsSync } from "node:fs";
import { join } from "node:path";
import { git, readJson, readManifest, writeJson, writeJsonValidated } from "casekit-core";
import { EffortSchema, ProviderSchema } from "model-client";
import { FindingSchema } from "reviewbot";
import { z } from "zod";
import { ArmSchema, type Cell } from "./grid.js";

const LineRangeSchema = z.tuple([z.int().positive(), z.int().positive()]);

/** persisted evidence for one cell, request carries full provenance instead of a separate manifest that could drift */
export const ResultCellSchema = z.object({
  cell: z.object({
    case: z.string(),
    state: z.string(),
    arm: ArmSchema,
    run: z.int().positive(),
  }),
  request: z.object({
    provider: ProviderSchema,
    model: z.string(),
    temperature: z.number(),
    /** absent means default effort of the provider */
    effort: EffortSchema.optional(),
    prompt_sha256: z.string(),
    harness_commit: z.string(),
    dataset_version: z.string(),
  }),
  response_raw: z.string(),
  /** null means the model never returned valid schema */
  findings_parsed: z.array(FindingSchema).nullable(),
  transition_touched_ranges: z.record(z.string(), z.array(LineRangeSchema)),
  usage: z.object({
    input_tokens: z.int().nonnegative(),
    output_tokens: z.int().nonnegative(),
    reasoning_tokens: z.int().nonnegative(),
    cache_read_tokens: z.int().nonnegative(),
    cache_write_tokens: z.int().nonnegative(),
  }),
  latency_ms: z.int().nonnegative(),
  timestamp: z.iso.datetime(),
  attempt: z.int().positive(),
});
export type ResultCell = z.infer<typeof ResultCellSchema>;

export function runDir(datasetDir: string, runId: string): string {
  return join(datasetDir, "results", "runs", runId);
}

/** keeps state under its own root, so results/runs stays just the cells */
export function stateRoot(datasetDir: string, runId: string): string {
  return join(runDir(datasetDir, runId), "state");
}

function cellPath(datasetDir: string, runId: string, cell: Cell, suffix: string): string {
  return join(runDir(datasetDir, runId), cell.case, cell.state, cell.arm, `r${cell.run}${suffix}`);
}

export function resultPath(datasetDir: string, runId: string, cell: Cell): string {
  return cellPath(datasetDir, runId, cell, ".json");
}

/** skips cells already on disk, a file that fails to parse counts as absent */
export function isDone(datasetDir: string, runId: string, cell: Cell): boolean {
  const path = resultPath(datasetDir, runId, cell);
  if (!existsSync(path)) return false;
  try {
    readJson(ResultCellSchema, path);
    return true;
  } catch {
    return false;
  }
}

export function writeResult(
  datasetDir: string,
  runId: string,
  cell: Cell,
  result: ResultCell,
): void {
  writeJsonValidated(resultPath(datasetDir, runId, cell), ResultCellSchema, result);
}

/** kept visible so the cell reads as incomplete */
export function writeError(datasetDir: string, runId: string, cell: Cell, error: unknown): void {
  writeJson(cellPath(datasetDir, runId, cell, ".error.json"), {
    cell,
    error: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  });
}

/** -dirty marker on uncommitted changes */
export function harnessCommit(): string {
  try {
    const cwd = process.cwd();
    const sha = git(cwd, ["rev-parse", "--short", "HEAD"]);
    return git(cwd, ["status", "--porcelain"]).length > 0 ? `${sha}-dirty` : sha;
  } catch {
    return "unknown";
  }
}

export function datasetVersion(datasetDir: string): string {
  return readManifest(datasetDir).dataset_version;
}
