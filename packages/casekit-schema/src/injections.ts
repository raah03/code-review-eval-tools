import { z } from "zod";
import {
  CaseIdSchema,
  CategorySchema,
  FindingIdSchema,
  IterationIdSchema,
  RelPathSchema,
  SourceSchema,
  hasUniqueIds,
} from "./common.js";

/** find must be a unique substring of the file, not a whole statement,
 * widened it if it collides */
export const EditSchema = z
  .object({
    file: RelPathSchema,
    find: z.string().min(1),
    replace: z.string().min(1),
  })
  .refine((e) => e.find !== e.replace, {
    message: "replace must differ from find",
    path: ["replace"],
  });
export type Edit = z.infer<typeof EditSchema>;

export const ReviewSchema = z.object({
  verdict: z.enum(["accept", "reject"]),
  reviewed_at: z.iso.date(),
});
export type Review = z.infer<typeof ReviewSchema>;

/** a defect from the injector, or a clean refactor casekit plan made itself */
export const FindingSchema = z
  .object({
    id: FindingIdSchema,
    category: CategorySchema,
    file: RelPathSchema,
    edits: z.array(EditSchema).min(1),
    description: z.string().min(1),
    /** null until reviewed, or permanently null for a clean finding */
    review: ReviewSchema.nullable(),
  })
  .refine((f) => f.edits.every((e) => e.file === f.file), {
    message: "every edit must target the finding's own file",
    path: ["edits"],
  });
export type Finding = z.infer<typeof FindingSchema>;

/** one state in the timeline, active lists which findings' edits apply */
export const IterationPlanSchema = z.object({
  id: IterationIdSchema,
  kind: z.enum(["pull_request", "fix", "cosmetic"]),
  active: z.array(FindingIdSchema),
});
export type IterationPlan = z.infer<typeof IterationPlanSchema>;

/** plan is null until casekit plan runs, build only replays the plan */
export const InjectionsSchema = z
  .object({
    case_id: CaseIdSchema,
    source: SourceSchema,
    injector: z.object({
      model: z.string().min(1),
      run_date: z.iso.date(),
      /** optional, older cases predate this field and never get regenerated */
      usage: z
        .object({
          input_tokens: z.number().int().nonnegative(),
          output_tokens: z.number().int().nonnegative(),
        })
        .optional(),
    }),
    findings: z.array(FindingSchema).min(1),
    plan: z.array(IterationPlanSchema).min(1).nullable(),
  })
  .refine((doc) => hasUniqueIds(doc.findings), {
    message: "finding ids must be unique",
    path: ["findings"],
  })
  .refine((doc) => doc.plan === null || hasUniqueIds(doc.plan), {
    message: "iteration ids in plan must be unique",
    path: ["plan"],
  })
  .refine(
    (doc) =>
      doc.plan === null ||
      doc.plan.every((it) => it.active.every((id) => doc.findings.some((f) => f.id === id))),
    {
      message: "plan's active sets must name finding ids that exist in findings",
      path: ["plan"],
    },
  );
export type Injections = z.infer<typeof InjectionsSchema>;
