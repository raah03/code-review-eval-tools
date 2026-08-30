import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { expect, test, vi } from "vitest";
import { LineageError } from "reviewbot";
import { buildGrid, type Cell } from "../src/lib/grid.js";
import { resultPath } from "../src/lib/results.js";
import { runCell } from "../src/lib/runner.js";
import { StateCache } from "../src/lib/state-cache.js";

const prompts: string[] = [];

vi.mock("model-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("model-client")>()),
  callModel: vi.fn(async (options: { prompt: string }) => {
    prompts.push(options.prompt);
    const findings = [
      {
        file: "a.ts",
        line_start: 1,
        line_end: 1,
        category: "logic",
        message: `call ${prompts.length}`,
      },
    ];
    return {
      output: { findings },
      raw: JSON.stringify({ findings }),
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        reasoning_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      },
      latency_ms: 1,
    };
  }),
}));

const STATES = ["i0", "i1", "i2", "i3"];

/** the fixture is a built case on disk, so it stays readable as dataset json rather than literals */
function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "evalkit-e2e-"));
  cpSync(resolve(import.meta.dirname, "fixtures"), dir, { recursive: true });
  return dir;
}

function options(datasetDir: string, runId: string) {
  return {
    datasetDir,
    runId,
    model: { provider: "openai", apiKey: "k", model: "m", temperature: 1 } as const,
    harnessCommit: "test",
    datasetVersion: "0.0.0-fixture",
  };
}

async function runGrid(datasetDir: string, runId: string, cells: Cell[]): Promise<void> {
  const cache = new StateCache(datasetDir);
  try {
    for (const cell of cells) await runCell(options(datasetDir, runId), cell, cache);
  } finally {
    cache.cleanup();
  }
}

/** every path a run wrote, relative so the snapshot does not carry the temp dir */
const tree = (dir: string, runId: string) =>
  execFileSync("find", [join(dir, "results", "runs", runId), "-type", "f"], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((path) => relative(dir, path))
    .sort()
    .join("\n");

test("the grid covers every combination exactly once", async () => {
  const cells = buildGrid(["case-900"], STATES, ["baseline", "middleware"], 2);
  const paths = cells.map((cell) => resultPath("", "run", cell));
  expect(new Set(paths).size).toBe(cells.length);
  await expect(paths.join("\n")).toMatchFileSnapshot("__snapshots__/grid.txt");
});

test("a full grid writes one result per cell, and state for the middleware only", async () => {
  const dir = fixture();
  await runGrid(dir, "run-1", buildGrid(["case-900"], STATES, ["baseline", "middleware"], 2));

  await expect(tree(dir, "run-1")).toMatchFileSnapshot("__snapshots__/run-tree.txt");
});

test("a lineage reads only its own predecessor", async () => {
  const dir = fixture();
  await runGrid(dir, "run-2", buildGrid(["case-900"], STATES, ["middleware"], 1));

  // r1 has a full set of snapshots on disk, r2 has none, so r2 cannot start at i2
  const cell: Cell = { case: "case-900", state: "i2", arm: "middleware", run: 2 };
  await expect(runGrid(dir, "run-2", [cell])).rejects.toBeInstanceOf(LineageError);
  expect(existsSync(resultPath(dir, "run-2", cell))).toBe(false);
});

test("a finished cell is not called again ('cached')", async () => {
  const dir = fixture();
  const cells = buildGrid(["case-900"], STATES, ["baseline"], 1);
  await runGrid(dir, "run-3", cells);
  const after = prompts.length;
  await runGrid(dir, "run-3", cells);
  expect(prompts).toHaveLength(after);
});
