import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { LineRange } from "casekit-schema";
import { SLICE_CONTEXT, sliceAroundRanges } from "diffkit";
import { loadTemplate, renderTemplate } from "model-client";

/** two logic, one security, one smell, f5 is the clean finding */
export const SLOT_CATEGORY: Record<string, "logic" | "security" | "smell" | "clean"> = {
  F1: "logic",
  F2: "logic",
  F3: "security",
  F4: "smell",
  F5: "clean",
};

// dist/lib/inject/prompt.js -> apps/casekit/dist -> apps/casekit/templates/inject.md
const TEMPLATE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "templates",
  "inject.md",
);

export interface PromptFile {
  path: string;
  content: string;
  changedRanges: LineRange[];
}

export interface PromptInput {
  commitSubject: string;
  files: PromptFile[];
  slots: readonly string[];
  priorIssues?: string[];
}

export function buildInjectPrompt(input: PromptInput): string {
  const { files, slots, priorIssues } = input;

  const instructions = renderTemplate(loadTemplate(TEMPLATE_PATH), {
    commitSubject: input.commitSubject,
    slotList: slots.map((s) => `${s} (${SLOT_CATEGORY[s]})`).join(", "),
  });

  const fileBlocks = files
    .map((f) => {
      const ranges = f.changedRanges.map(([s, e]) => (s === e ? `${s}` : `${s}-${e}`)).join(", ");
      // windows only, so an outlier file doesn't drown the eligible lines in noise
      const sliced = sliceAroundRanges(f.content, f.changedRanges, SLICE_CONTEXT);
      return `### ${f.path}\nLines this commit changed (only these are eligible): ${ranges}\n\`\`\`\n${sliced}\n\`\`\``;
    })
    .join("\n\n");

  const retryBlock =
    priorIssues && priorIssues.length > 0
      ? `\nYour previous proposal was rejected for these reasons, fix them:\n${priorIssues.map((i) => `- ${i}`).join("\n")}\n`
      : "";

  return `${instructions}${retryBlock}\n${fileBlocks}`;
}
