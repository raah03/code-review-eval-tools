import { createHash } from "node:crypto";
import {
  ModelCallFailure,
  addUsage,
  callModel,
  type Effort,
  type Provider,
  type TokenUsage,
} from "model-client";
import { ReviewFailure } from "./errors.js";
import { ReviewResponseSchema, type ReviewResult } from "./types.js";

export interface ModelConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  temperature: number;
  effort?: Effort;
}

const RETRY_NOTE =
  "Your previous response did not match the requested schema. Respond again with only the findings object.";

/** one paid re-prompt on schema failure, then it becomes a {@link ReviewFailure}.
 *  transport failures are retried inside callModel already */
export async function callReviewer(model: ModelConfig, prompt: string): Promise<ReviewResult> {
  const prompt_sha256 = createHash("sha256").update(prompt).digest("hex");

  // billed tokens from a failed attempt still belong in the cell's usage
  let priorUsage: TokenUsage | null = null;

  for (let attempts = 1; ; attempts++) {
    try {
      const call = await callModel({
        ...model,
        prompt: attempts === 1 ? prompt : `${prompt}\n\n${RETRY_NOTE}`,
        schema: ReviewResponseSchema,
      });
      return {
        findings: call.output.findings,
        raw: call.raw,
        usage: priorUsage ? addUsage(priorUsage, call.usage) : call.usage,
        latency_ms: call.latency_ms,
        prompt_sha256,
        attempts,
      };
    } catch (error) {
      if (!(error instanceof ModelCallFailure)) throw error;
      priorUsage = priorUsage ? addUsage(priorUsage, error.usage) : error.usage;
      if (attempts >= 2) {
        throw new ReviewFailure(error.raw, priorUsage, error.latency_ms, prompt_sha256, attempts);
      }
    }
  }
}
