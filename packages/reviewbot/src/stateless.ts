import { callReviewer, type ModelConfig } from "./call.js";
import { renderReviewPrompt } from "./prompt.js";
import type { Reviewer, ReviewRequest, ReviewResult } from "./types.js";

/** no memory between calls, so run-to-run variation is attributable to the model alone */
export class StatelessReviewer implements Reviewer {
  constructor(private readonly model: ModelConfig) {}

  review(request: ReviewRequest): Promise<ReviewResult> {
    return callReviewer(this.model, renderReviewPrompt(request, null));
  }
}
