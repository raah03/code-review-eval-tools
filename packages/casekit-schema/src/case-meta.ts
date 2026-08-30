import { z } from "zod";
import {
  CaseIdSchema,
  CategorySchema,
  FindingIdSchema,
  IterationIdSchema,
  LineRangeSchema,
  RelPathSchema,
  SourceSchema,
  hasUniqueIds,
} from "./common.js";

export const IterationSchema = z.object({
  id: IterationIdSchema,
  kind: z.enum(["pull_request", "fix", "cosmetic"]),
  /** the only thing distinguishing one iteration from another */
  active: z.array(FindingIdSchema),
  changed_files: z.array(RelPathSchema).min(1),
  /** files which are shown to the reviewer */
  review_files: z.array(RelPathSchema),
  deleted: z.array(RelPathSchema).default([]),
});
export type Iteration = z.infer<typeof IterationSchema>;

/** active points at replace text, inactive at find text */
export const LocationSchema = z.object({
  status: z.enum(["active", "inactive"]),
  lines: LineRangeSchema,
});
export type Location = z.infer<typeof LocationSchema>;

/** ground truth for scoring, description and verdict live only in injections.json */
export const FindingMetaSchema = z.object({
  id: FindingIdSchema,
  category: CategorySchema,
  file: RelPathSchema,
  /** keyed by iteration id, every iteration must have an entry here */
  locations: z.record(z.string(), LocationSchema),
});
export type FindingMeta = z.infer<typeof FindingMetaSchema>;

/** derived from injections.json, code ground truth only. gate verdicts live in MANIFEST.json */
export const CaseMetaSchema = z
  .object({
    id: CaseIdSchema,
    source: SourceSchema,
    language: z.literal("typescript"),
    changed_lines_source_only: z.int().positive(),
    iterations: z.array(IterationSchema).min(1),
    findings: z.array(FindingMetaSchema).min(1),
  })
  .refine((m) => hasUniqueIds(m.iterations), {
    message: "iteration ids must be unique",
    path: ["iterations"],
  })
  .refine((m) => hasUniqueIds(m.findings), {
    message: "finding ids must be unique",
    path: ["findings"],
  })
  .refine((m) => m.findings.every((f) => m.iterations.every((it) => it.id in f.locations)), {
    message: "every finding must have a location recorded for every iteration",
    path: ["findings"],
  })
  .refine(
    (m) =>
      m.findings.every((f) =>
        m.iterations.every(
          (it) => (f.locations[it.id]?.status === "active") === it.active.includes(f.id),
        ),
      ),
    {
      message: "a finding's location status must match whether it's in that iteration's active set",
      path: ["findings"],
    },
  );
export type CaseMeta = z.infer<typeof CaseMetaSchema>;
