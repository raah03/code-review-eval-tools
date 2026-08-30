import { z } from "zod";

/** permissive licenses a source repo may carry */
export const LicenseSchema = z.enum(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC"]);
export type License = z.infer<typeof LicenseSchema>;

export const ShaSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "must be a 40-character git commit SHA");
export type Sha = z.infer<typeof ShaSchema>;

export const RelPathSchema = z
  .string()
  .min(1)
  .refine((p) => !p.startsWith("/") && !p.split("/").includes(".."), {
    message: "must be a relative path with no `..` segments",
  });
export type RelPath = z.infer<typeof RelPathSchema>;

export const LineRangeSchema = z
  .tuple([z.int().positive(), z.int().positive()])
  .refine(([start, end]) => start <= end, { message: "range start must not exceed end" });
export type LineRange = z.infer<typeof LineRangeSchema>;

export const FindingIdSchema = z.string().min(1);
export type FindingId = z.infer<typeof FindingIdSchema>;

export const CategorySchema = z.enum(["logic", "security", "smell", "clean"]);
export type Category = z.infer<typeof CategorySchema>;

export const IterationIdSchema = z.string().min(1);
export type IterationId = z.infer<typeof IterationIdSchema>;

export const CaseIdSchema = z.string().regex(/^case-\d{3}$/, "must look like case-001");
export type CaseId = z.infer<typeof CaseIdSchema>;

export const SourceSchema = z.object({
  repo: z.url(),
  commit: ShaSchema,
  base_commit: ShaSchema,
  commit_date: z.iso.date(),
  commit_subject: z.string().min(1),
});
export type Source = z.infer<typeof SourceSchema>;

export function hasUniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((i) => i.id)).size === items.length;
}
