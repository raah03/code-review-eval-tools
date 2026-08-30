import { z } from "zod";

/** properties decidable from the github api alone */
export const ScreenCriterionSchema = z.enum([
  "language",
  "popularity",
  "activity",
  "license",
  "lockfile",
  "tsconfig",
  "size",
  "provenance",
]);
export type ScreenCriterion = z.infer<typeof ScreenCriterionSchema>;

/** cli overridable, recorded so each shortlist keeps its numbers */
export const ScreenThresholdsSchema = z.object({
  minStars: z.int().positive(),
  pushedWithinDays: z.int().positive(),
  licenses: z.array(z.string().min(1)).min(1),
  maxSizeMb: z.int().positive(),
  commitSample: z.int().positive(),
  minPrLinkedRatio: z.number().min(0).max(1),
});
export type ScreenThresholds = z.infer<typeof ScreenThresholdsSchema>;

/** only for repos that pass the metadata screen */
export const ScreenEvidenceSchema = z.object({
  /** null if there's no lockfile at the root */
  lockfile: z.string().nullable(),
  /** root preferred, else the shallowest nested one */
  tsconfig: z.string().nullable(),
  /** github's tree listing hit its cap, a tsconfig may be hidden */
  treeTruncated: z.boolean(),
  commitsSampled: z.int().nonnegative(),
  prLinkedCommits: z.int().nonnegative(),
  prLinkedRatio: z.number().min(0).max(1),
  /** true if checked via the prs endpoint, not just the message */
  provenanceVerifiedByApi: z.boolean(),
  /** not a criterion, merge-commit repos just need different mining */
  mergeCommits: z.int().nonnegative(),
});
export type ScreenEvidence = z.infer<typeof ScreenEvidenceSchema>;

export const ScreenedRepoSchema = z
  .object({
    /** owner/name, the github identity not the repos.yaml slug */
    id: z.string().min(1),
    url: z.url(),
    primaryLanguage: z.string().nullable(),
    stars: z.int().nonnegative(),
    pushedAt: z.iso.datetime(),
    archived: z.boolean(),
    fork: z.boolean(),
    /** raw spdx id from github, not the allowlist enum */
    license: z.string().nullable(),
    sizeMb: z.number().nonnegative(),
    defaultBranch: z.string().min(1),
    /** null when the metadata screen already rejected the repo */
    evidence: ScreenEvidenceSchema.nullable(),
    failed: z.array(ScreenCriterionSchema),
    pass: z.boolean(),
  })
  .refine((r) => r.pass === (r.failed.length === 0), {
    message: "pass must reflect whether any criterion failed",
    path: ["pass"],
  });
export type ScreenedRepo = z.infer<typeof ScreenedRepoSchema>;

/** audit trail for a run, survivors and verdicts feed repos.yaml and MANIFEST.json */
export const ScreeningReportSchema = z.object({
  screenedAt: z.iso.date(),
  /** verbatim query, or a marker when --repo was used */
  query: z.string().min(1),
  /** true pool size, only the top poolRequested by stars were pulled */
  poolTotalCount: z.int().nonnegative(),
  poolRequested: z.int().positive(),
  poolReturned: z.int().nonnegative(),
  thresholds: ScreenThresholdsSchema,
  /** counts overlap on purpose, a repo counts against every criterion it fails */
  rejections: z.record(ScreenCriterionSchema, z.int().nonnegative()),
  survivors: z.array(z.string()),
  repos: z.array(ScreenedRepoSchema),
});
export type ScreeningReport = z.infer<typeof ScreeningReportSchema>;
