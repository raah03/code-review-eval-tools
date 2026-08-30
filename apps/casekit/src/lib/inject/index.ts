import {
  CaseIdSchema,
  FindingSchema,
  SourceSchema,
  type Finding,
  type Injections,
  type LineRange,
  type Source,
} from "casekit-schema";
import {
  callModel,
  ModelCallFailure,
  PROVIDER_API_KEY_ENV,
  type Effort,
  type Provider,
} from "model-client";
import {
  injectionsPath,
  readJsonRaw,
  repoMirrorPath,
  requireRepoByUrl,
  showFile,
  writeInjections,
} from "casekit-core";
import { logger } from "logger";
import { today } from "../date.js";
import { locate } from "../locate.js";
import { verifyTypecheck } from "../typecheck/index.js";
import { createWorktree, destroyWorktree, type Worktree } from "../worktree.js";
import { changedRanges, touchedSourceFiles } from "./diff.js";
import { buildInjectPrompt } from "./prompt.js";
import { ProposalSchema } from "./schema.js";
import { localityIssues, type PlacedFinding } from "./scope.js";
import { validateRound } from "./validate.js";

/** all five findings come from one call, one prompt */
const SLOTS = ["F1", "F2", "F3", "F4", "F5"] as const;

export interface InjectOptions {
  provider: Provider;
  model: string;
  temperature: number;
  /** unset leaves the provider default (mirrors evalkit's --effort) */
  effort?: Effort;
  maxAttempts: number;
  /** regenerates one slot instead of all five, for a rejected finding */
  slot?: string;
}

/** warning: the doc isn't schema-valid until inject writes it back */
function readCaseSource(
  datasetDir: string,
  caseId: string,
): { source: Source; findings: Finding[]; plan: Injections["plan"] } {
  const raw = readJsonRaw(injectionsPath(datasetDir, caseId)) as {
    case_id?: unknown;
    source?: unknown;
    findings?: unknown;
    plan?: unknown;
  };
  CaseIdSchema.parse(raw.case_id);
  const source = SourceSchema.parse(raw.source);
  const findings = Array.isArray(raw.findings)
    ? raw.findings.map((f) => FindingSchema.parse(f))
    : [];
  const plan = (raw.plan as Injections["plan"] | undefined) ?? null;
  return { source, findings, plan };
}

export async function injectCase(
  datasetDir: string,
  caseId: string,
  options: InjectOptions,
): Promise<void> {
  const { source, findings: existing, plan } = readCaseSource(datasetDir, caseId);
  const repo = requireRepoByUrl(datasetDir, source.repo);

  if (options.slot === undefined && existing.length > 0) {
    throw new Error(
      `${caseId} already has ${existing.length} finding(s), pass --slot to replace one, ` +
        `or clear injections/${caseId}.json's "findings" by hand first`,
    );
  }
  if (options.slot !== undefined && !existing.some((f) => f.id === options.slot)) {
    throw new Error(`${caseId}: --slot ${options.slot} does not match an existing finding id`);
  }

  const apiKeyEnv = PROVIDER_API_KEY_ENV[options.provider];
  const apiKey = process.env[apiKeyEnv];
  if (!apiKey) throw new Error(`inject: set ${apiKeyEnv} in .env`);

  const mirror = repoMirrorPath(repo.id);
  const { commit, base_commit: base } = source;

  const files = touchedSourceFiles(mirror, base, commit);
  if (files.length === 0)
    throw new Error(`${caseId}: no non-test source files changed by ${commit}`);

  const contentByFile = new Map(files.map((f) => [f, showFile(mirror, commit, f)]));
  const rangesByFile = new Map(files.map((f) => [f, changedRanges(mirror, base, commit, f)]));

  const slots = options.slot ? [options.slot] : [...SLOTS];
  const keptFindings = options.slot ? existing.filter((f) => f.id !== options.slot) : [];
  const keptPlaced: PlacedFinding[] = keptFindings.map((f) => ({
    slot: f.id,
    file: f.file,
    range: locate(contentByFile.get(f.file) ?? "", f.edits[0]?.find ?? "", `${caseId} ${f.id}`),
  }));

  let issues: string[] = [];
  // created lazily on first use, reused after so build-tool caches carry over
  let worktree: Worktree | undefined;
  const usage = { input_tokens: 0, output_tokens: 0 };

  try {
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      logger.info(
        `inject: ${caseId}: attempt ${attempt}/${options.maxAttempts} (${slots.join(", ")})`,
      );

      const prompt = buildInjectPrompt({
        commitSubject: source.commit_subject,
        files: files.map((f) => ({
          path: f,
          content: contentByFile.get(f) as string,
          changedRanges: rangesByFile.get(f) as LineRange[],
        })),
        slots,
        priorIssues: issues,
      });

      let proposal;
      try {
        const call = await callModel({
          provider: options.provider,
          apiKey,
          model: options.model,
          temperature: options.temperature,
          effort: options.effort,
          prompt,
          schema: ProposalSchema,
        });
        usage.input_tokens += call.usage.input_tokens;
        usage.output_tokens += call.usage.output_tokens;
        proposal = call.output;
      } catch (error) {
        if (!(error instanceof ModelCallFailure)) throw error;
        usage.input_tokens += error.usage.input_tokens;
        usage.output_tokens += error.usage.output_tokens;
        issues = [`model did not return a schema-valid proposal: ${error.raw.slice(0, 500)}`];
        continue;
      }
      const round = validateRound({
        caseId,
        slots,
        proposals: proposal.findings,
        files,
        contentByFile,
        rangesByFile,
      });
      if (round.issues.length > 0) {
        issues = round.issues;
        continue;
      }

      const locality = localityIssues([...keptPlaced, ...round.placed], contentByFile);
      if (locality.length > 0) {
        issues = locality;
        continue;
      }

      const allFindings = [...keptFindings, ...round.findings];
      worktree ??= createWorktree(mirror, repo.id, commit);
      const typecheck = verifyTypecheck(
        worktree,
        repo,
        commit,
        allFindings.flatMap((f) => f.edits),
      );
      if (!typecheck.ok) {
        issues = [
          `edited tree failed to typecheck:\n${typecheck.output.split("\n").slice(0, 20).join("\n")}`,
        ];
        continue;
      }

      writeInjections(datasetDir, caseId, {
        case_id: caseId,
        source,
        injector: { model: options.model, run_date: today(), usage: { ...usage } },
        findings: allFindings,
        plan,
      });
      logger.info(
        `inject: ${caseId}: wrote ${round.findings.length} finding(s) (${slots.join(", ")})`,
      );
      return;
    }

    throw new Error(
      `${caseId}: gave up after ${options.maxAttempts} attempt(s), last issues:\n${issues.join("\n")}`,
    );
  } finally {
    if (worktree) destroyWorktree(mirror, worktree);
    logger.info(
      `inject: ${caseId}: ${usage.input_tokens} input / ${usage.output_tokens} output token(s) across ${options.model}`,
    );
  }
}
