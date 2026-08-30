import { logger } from "logger";
import {
  FileStateStore,
  LineageError,
  ReviewFailure,
  StatefulReviewer,
  StatelessReviewer,
  type ModelConfig,
  type Reviewer,
} from "reviewbot";
import { cellLabel, type Cell } from "./grid.js";
import { buildRequest } from "./request.js";
import { isDone, stateRoot, writeError, writeResult, type ResultCell } from "./results.js";
import type { StateCache } from "./state-cache.js";

export interface RunnerOptions {
  datasetDir: string;
  runId: string;
  model: ModelConfig;
  harnessCommit: string;
  datasetVersion: string;
}

/** interface for the runner to call the Reviewer Interface */
function reviewerFor(opts: RunnerOptions, cell: Cell): Reviewer {
  return cell.arm === "middleware"
    ? new StatefulReviewer(opts.model, new FileStateStore(stateRoot(opts.datasetDir, opts.runId)))
    : new StatelessReviewer(opts.model);
}

/** ReviewFailure writes findings_parsed null, a result about the model not a harness
 *  fault. LineageError isn't caught here, it must stop the run */
export async function runCell(opts: RunnerOptions, cell: Cell, cache: StateCache): Promise<void> {
  if (isDone(opts.datasetDir, opts.runId, cell)) {
    logger.debug(`${cellLabel(cell)}: already done, skipping`);
    return;
  }

  const { request, transitionTouchedRanges } = buildRequest(opts.datasetDir, cell, cache);
  logger.info(`${cellLabel(cell)}: calling ${opts.model.model}`);

  const base = {
    cell,
    transition_touched_ranges: transitionTouchedRanges,
    timestamp: new Date().toISOString(),
  };
  const provenance = {
    provider: opts.model.provider,
    model: opts.model.model,
    temperature: opts.model.temperature,
    effort: opts.model.effort,
    harness_commit: opts.harnessCommit,
    dataset_version: opts.datasetVersion,
  };

  try {
    const review = await reviewerFor(opts, cell).review(request);
    const result: ResultCell = {
      ...base,
      request: { ...provenance, prompt_sha256: review.prompt_sha256 },
      response_raw: review.raw,
      findings_parsed: review.findings,
      usage: review.usage,
      latency_ms: review.latency_ms,
      attempt: review.attempts,
    };
    writeResult(opts.datasetDir, opts.runId, cell, result);
    logger.info(`${cellLabel(cell)}: ${review.findings.length} findings`);
  } catch (error) {
    // not a cell outcome, propagate and let the cli abort
    if (error instanceof LineageError) throw error;
    if (!(error instanceof ReviewFailure)) {
      logger.error(`${cellLabel(cell)}: call failed after retries: ${String(error)}`);
      writeError(opts.datasetDir, opts.runId, cell, error);
      return;
    }
    writeResult(opts.datasetDir, opts.runId, cell, {
      ...base,
      request: { ...provenance, prompt_sha256: error.prompt_sha256 },
      response_raw: error.raw,
      findings_parsed: null,
      usage: error.usage,
      latency_ms: error.latency_ms,
      attempt: error.attempts,
    });
    logger.warn(
      `${cellLabel(cell)}: no schema-valid findings after retry, stored with findings_parsed: null`,
    );
  }
}
