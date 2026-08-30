import { callReviewer, type ModelConfig } from "./call.js";
import { LineageError } from "./errors.js";
import { renderReviewPrompt, type History } from "./prompt.js";
import type { Reviewer, ReviewRequest, ReviewResult, StateStore } from "./types.js";

/** same input as {@link StatelessReviewer} plus last round's findings, acts on the request path only */
export class StatefulReviewer implements Reviewer {
  constructor(
    private readonly model: ModelConfig,
    private readonly store: StateStore,
  ) {}

  async review(request: ReviewRequest): Promise<ReviewResult> {
    const result = await callReviewer(
      this.model,
      renderReviewPrompt(request, this.history(request)),
    );
    this.store.save(request.lineage.id, request.lineage.step, result.findings);
    return result;
  }

  /** missing predecessor is a hard error, not empty history, else stateful would look stateless */
  private history(request: ReviewRequest): History | null {
    const { id, previousStep } = request.lineage;
    if (previousStep === null) return null;

    const previousFindings = this.store.load(id, previousStep);
    if (previousFindings === null) {
      throw new LineageError(
        `${id}: no state on record for "${previousStep}", so "${request.lineage.step}" cannot be reviewed statefully. ` +
          `Review the lineage in order, starting from its first step.`,
      );
    }
    return { previousFindings, previousLabel: previousStep };
  }
}
