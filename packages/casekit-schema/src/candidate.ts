import { z } from "zod";
import { ShaSchema } from "./common.js";

/** everything casekit mine can reject a commit for */
export const MineCriterionSchema = z.enum([
  "merge",
  "noParent",
  "revert",
  "chore",
  "docs",
  "pureFormatting",
  "band",
  "fileCount",
  "prLinked",
  "parentTypecheck",
]);
export type MineCriterion = z.infer<typeof MineCriterionSchema>;

export const ParentTypecheckStatusSchema = z.enum([
  "verified-pass",
  "verified-fail",
  "assumed-pass",
  "not-run", // doesn't meet any criteria that would require a typecheck
]);
export type ParentTypecheckStatus = z.infer<typeof ParentTypecheckStatusSchema>;

export const MineThresholdsSchema = z.object({
  minLines: z.int().positive(),
  maxLines: z.int().positive(),
  minSourceFiles: z.int().positive(),
  trainingCutoffDate: z.iso.date(),
});
export type MineThresholds = z.infer<typeof MineThresholdsSchema>;

/** every commit since the cutoff, not just survivors, cheap criteria run first so failures skip typecheck */
export const CandidateCommitSchema = z
  .object({
    repo: z.string().min(1),
    commit: ShaSchema,
    parent: ShaSchema,
    authorDate: z.iso.date(),
    subject: z.string().min(1),
    changedLinesSourceOnly: z.int().nonnegative(),
    linesAdded: z.int().nonnegative(),
    linesRemoved: z.int().nonnegative(),
    touchesSourceFileCount: z.int().nonnegative(),
    parentTypecheckStatus: ParentTypecheckStatusSchema,
    failed: z.array(MineCriterionSchema),
    qualifies: z.boolean(),
  })
  .refine((c) => c.qualifies === (c.failed.length === 0), {
    message: "qualifies must reflect whether any criterion failed",
    path: ["qualifies"],
  })
  .refine((c) => c.changedLinesSourceOnly === c.linesAdded + c.linesRemoved, {
    message: "changedLinesSourceOnly must equal linesAdded + linesRemoved",
    path: ["changedLinesSourceOnly"],
  })
  .refine(
    (c) => (c.parentTypecheckStatus === "verified-fail") === c.failed.includes("parentTypecheck"),
    {
      message: "parentTypecheckStatus must be verified-fail iff parentTypecheck is in failed",
      path: ["parentTypecheckStatus"],
    },
  );
export type CandidateCommit = z.infer<typeof CandidateCommitSchema>;

export const MineReportSchema = z.object({
  minedAt: z.iso.date(),
  repo: z.string().min(1),
  thresholds: MineThresholdsSchema,
  /** false for --count-only, leaves parentTypecheckStatus at not-run for everything */
  verifiedTypechecks: z.boolean(),
  candidates: z.array(CandidateCommitSchema),
});
export type MineReport = z.infer<typeof MineReportSchema>;
