import { z } from "zod";
import { CaseIdSchema, LicenseSchema } from "./common.js";

/** plain pass/fail per gate, no command/value/note, that's reproducible by rerunning casekit gate */
export const CaseGatesSchema = z.object({
  typecheck: z.boolean(),
  sizeband: z.boolean(),
  locations: z.boolean(),
  transitions: z.boolean(),
  disjoint: z.boolean(),
  twoDefects: z.boolean(),
  reviewed: z.boolean(),
});
export type CaseGates = z.infer<typeof CaseGatesSchema>;

/** the freeze record, repo list with licenses and attribution, seed, gate outcomes per case */
export const ManifestSchema = z
  .object({
    dataset_version: z.string().min(1),
    generated: z.iso.date(),
    note: z.string().optional(),
    /** fixed when the repo list is locked, every mining filter reads this */
    training_cutoff_date: z.iso.date(),
    seed: z.int(),
    repositories: z
      .array(
        z.object({
          repo: z.url(),
          license: LicenseSchema,
          attribution: z.string().min(1),
        }),
      )
      .min(1),
    cases: z
      .array(
        z.object({
          id: CaseIdSchema,
          repo: z.url(),
          gates: CaseGatesSchema,
        }),
      )
      .min(1),
  })
  .refine((m) => m.cases.every((c) => m.repositories.some((r) => r.repo === c.repo)), {
    message: "every case's repo must be one of repositories[].repo",
    path: ["cases"],
  })
  .refine((m) => new Set(m.cases.map((c) => c.id)).size === m.cases.length, {
    message: "case ids must be unique",
    path: ["cases"],
  });
export type Manifest = z.infer<typeof ManifestSchema>;
