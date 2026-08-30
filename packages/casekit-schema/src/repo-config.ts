import { z } from "zod";
import { LicenseSchema, ShaSchema } from "./common.js";

/** hand-authored yaml not json, casekit repos sync writes back only syncedAt/syncedRef via a round-trip api */
export const RepoConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "must be a lowercase-kebab slug"),
  url: z.url(),
  license: LicenseSchema,
  attribution: z.string().min(1),
  lockfilePath: z.string().min(1),
  installCommand: z.string().min(1),
  typecheckCommand: z.string().min(1),
  /** written by casekit repos sync, absent until synced once */
  syncedAt: z.iso.date().optional(),
  syncedRef: ShaSchema.optional(),
});
export type RepoConfig = z.infer<typeof RepoConfigSchema>;

export const RepoRegistrySchema = z.object({
  repos: z.array(RepoConfigSchema).min(1),
});
export type RepoRegistry = z.infer<typeof RepoRegistrySchema>;
