import { z } from "zod";

/** f5 is the clean finding, same shape as f1-f4 but mapped to clean not a defect category */
export const SlotSchema = z.enum(["F1", "F2", "F3", "F4", "F5"]);

export const ProposalSchema = z.object({
  findings: z.array(
    z.object({
      slot: SlotSchema,
      file: z.string().min(1),
      find: z.string().min(1),
      replace: z.string().min(1),
      description: z.string().min(1),
    }),
  ),
});
