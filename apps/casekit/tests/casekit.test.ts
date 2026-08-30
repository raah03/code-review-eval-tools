import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { caseDir, readCaseMeta, readInjections, readManifest } from "casekit-core";
import { beforeAll, expect, test, vi } from "vitest";

const TSC = resolve(import.meta.dirname, "../../../node_modules/.bin/tsc");
const defect = (line: number) => `export const v${line}: number = ${line};`;
const fixed = (line: number) => `export const v${line}: number = ${line} as number;`;

/** 100 rewritten lines puts changed_lines_source_only at 200, inside G2's band */
const source = (typed: boolean) =>
  `${Array.from({ length: 100 }, (_, i) =>
    typed ? defect(i + 1) : `export const v${i + 1} = ${i + 1};`,
  ).join("\n")}\n`;

let dataset = "";

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}

function substitute(path: string, values: Record<string, string>): void {
  const filled = Object.entries(values).reduce(
    (text, [token, value]) => text.replaceAll(token, value),
    readFileSync(path, "utf8"),
  );
  writeFileSync(path, filled);
}

function fixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "casekit-e2e-"));
  cpSync(resolve(import.meta.dirname, "fixtures"), dir, { recursive: true });

  process.env.CASEKIT_REPO_CACHE_DIR = mkdtempSync(join(tmpdir(), "casekit-cache-"));
  const mirror = join(process.env.CASEKIT_REPO_CACHE_DIR, "fixture-repo");
  mkdirSync(mirror, { recursive: true });

  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: mirror,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "fixture",
        GIT_AUTHOR_EMAIL: "fixture@example.com",
        GIT_COMMITTER_NAME: "fixture",
        GIT_COMMITTER_EMAIL: "fixture@example.com",
      },
    }).trim();

  git("init", "--quiet");
  write(join(mirror, "src", "a.ts"), source(false));
  git("add", ".");
  git("commit", "--quiet", "-m", "chore: init");
  const base = git("rev-parse", "HEAD");
  write(join(mirror, "src", "a.ts"), source(true));
  git("add", ".");
  git("commit", "--quiet", "-m", "feat: annotate types");

  // the shas and the local tsc are only knowable here, everything else is static json
  substitute(join(dir, "injections", "case-900.json"), {
    __COMMIT__: git("rev-parse", "HEAD"),
    __BASE__: base,
  });
  substitute(join(dir, "config", "repos.yaml"), { __TSC__: TSC });
  return dir;
}

const overlay = (state: string) =>
  readFileSync(join(caseDir(dataset, "case-900"), "pr", "files", state, "src", "a.ts"), "utf8");

/** the active defect lines at one state, the whole point of the overlay */
const active = (state: string) =>
  overlay(state)
    .split("\n")
    .filter((line) => line.includes("as number"))
    .join("\n");

/** drives the real cli entry point in process, so the commands and their wiring are covered too */
async function casekit(...args: string[]): Promise<void> {
  process.argv = [process.execPath, "casekit", "--dataset-dir", dataset, ...args];
  vi.resetModules();
  await import("../src/cli.js");
  await new Promise((resolve) => setImmediate(resolve));
}

const forCase = (command: string) => casekit(command, "--case", "case-900");

beforeAll(async () => {
  // a failing command would otherwise take the whole worker down with it
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`casekit exited with ${code}`);
  }) as never);

  dataset = fixture();
  await forCase("plan");
  await forCase("build");
});

test("the revert plan is reproducible from the seed alone", async () => {
  const plan = readInjections(dataset, "case-900").plan;
  await expect(JSON.stringify(plan, null, 2)).toMatchFileSnapshot("__snapshots__/plan.json");

  await forCase("plan");
  expect(readInjections(dataset, "case-900").plan).toEqual(plan);
});

test("build replays each iteration into its own overlay", async () => {
  const meta = readCaseMeta(caseDir(dataset, "case-900"));
  await expect(
    JSON.stringify(
      {
        changed_lines_source_only: meta.changed_lines_source_only,
        iterations: meta.iterations,
        active_defect_lines: Object.fromEntries(
          meta.iterations.map((it) => [it.id, active(it.id).split("\n")]),
        ),
      },
      null,
      2,
    ),
  ).toMatchFileSnapshot("__snapshots__/build.json");
});

test("every gate passes on a well-formed case", async () => {
  await forCase("gate");
  const gates = readManifest(dataset).cases[0]?.gates;
  await expect(JSON.stringify(gates, null, 2)).toMatchFileSnapshot("__snapshots__/gates-pass.json");
});

test("a gate rejects a case whose built files no longer match", async () => {
  write(
    join(caseDir(dataset, "case-900"), "pr", "files", "i0", "src", "a.ts"),
    overlay("i0").replace(fixed(10), defect(10)),
  );
  await forCase("gate");
  const gates = readManifest(dataset).cases[0]?.gates;
  await expect(JSON.stringify(gates, null, 2)).toMatchFileSnapshot("__snapshots__/gates-fail.json");
});
