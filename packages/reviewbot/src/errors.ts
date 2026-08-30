import type { TokenUsage } from "model-client";

/** predecessor not on record is a caller bug not a model problem, must stop the caller */
export class LineageError extends Error {}

export class ReviewFailure extends Error {
  constructor(
    readonly raw: string,
    readonly usage: TokenUsage,
    readonly latency_ms: number,
    readonly prompt_sha256: string,
    readonly attempts: number,
  ) {
    super(`model did not return schema-valid findings after ${attempts} attempts`);
  }
}
