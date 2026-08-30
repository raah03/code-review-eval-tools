import type { TokenUsage } from "model-client";
import { z } from "zod";

/** no clean field, unlike casekit-schema's version */
export const FindingSchema = z.object({
  file: z.string().min(1),
  line_start: z.int().positive(),
  line_end: z.int().positive(),
  category: z.enum(["logic", "security", "smell"]),
  message: z.string().min(1),
});
export type Finding = z.infer<typeof FindingSchema>;

export const ReviewResponseSchema = z.object({
  findings: z.array(FindingSchema),
});

/** only stateful reviewer reads previous */
export interface FileRevision {
  path: string;
  /** null when the file is new */
  base: string | null;
  current: string;
  /** null if there was no previous round */
  previous?: string | null;
}

/** opaque, nothing parses these ids */
export interface Lineage {
  id: string;
  step: string;
  /** null for first iteration */
  previousStep: string | null;
}

export interface ReviewRequest {
  files: FileRevision[];
  /** shown in the prompt heading */
  referenceLabel: string;
  lineage: Lineage;
}

export interface ReviewResult {
  findings: Finding[];
  /** kept even when parsing succeeds */
  raw: string;
  usage: TokenUsage;
  latency_ms: number;
  prompt_sha256: string;
  /** 2 means retry after schema failure */
  attempts: number;
}

export interface Reviewer {
  review(request: ReviewRequest): Promise<ReviewResult>;
}

export interface StateStore {
  /** null means unreviewed, empty means no findings */
  load(lineageId: string, step: string): Finding[] | null;
  save(lineageId: string, step: string, findings: Finding[]): void;
}
