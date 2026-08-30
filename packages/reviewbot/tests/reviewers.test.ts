import { expect, test, vi } from "vitest";
import { LineageError } from "../src/errors.js";
import { StatefulReviewer } from "../src/stateful.js";
import { StatelessReviewer } from "../src/stateless.js";
import type { Finding, ReviewRequest, StateStore } from "../src/types.js";

const prompts: string[] = [];

vi.mock("model-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("model-client")>()),
  callModel: vi.fn(async (options: { prompt: string }) => {
    prompts.push(options.prompt);
    return {
      output: { findings: [] },
      raw: "{}",
      usage: {
        input_tokens: 1,
        output_tokens: 1,
        reasoning_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
      },
      latency_ms: 1,
    };
  }),
}));

const MODEL = { provider: "openai", apiKey: "k", model: "m", temperature: 1 } as const;

const BASE = ["export function f() {", "  return 1;", "}", "", "export const x = 1;"].join("\n");
const I0 = BASE.replace("return 1;", "return 2;");
const I1 = I0.replace("export const x = 1;", "export const x = 2;");

function memoryStore(): StateStore & { seen: Map<string, Finding[]> } {
  const seen = new Map<string, Finding[]>();
  return {
    seen,
    load: (id, step) => seen.get(`${id}/${step}`) ?? null,
    save: (id, step, findings) => void seen.set(`${id}/${step}`, findings),
  };
}

function request(step: string, previousStep: string | null, current: string): ReviewRequest {
  return {
    referenceLabel: "base",
    lineage: { id: "case-900/r1", step, previousStep },
    files: [{ path: "a.ts", base: BASE, current, previous: previousStep === null ? null : I0 }],
  };
}

const PRIOR: Finding[] = [
  { file: "a.ts", line_start: 5, line_end: 5, category: "logic", message: "on changed lines" },
  { file: "a.ts", line_start: 2, line_end: 2, category: "smell", message: "on untouched lines" },
];

test("at the first step the middleware sends exactly the baseline's prompt", async () => {
  prompts.length = 0;
  await new StatefulReviewer(MODEL, memoryStore()).review(request("i0", null, I0));
  await new StatelessReviewer(MODEL).review(request("i0", null, I0));

  expect(prompts[0]).toBe(prompts[1]);
  await expect(prompts[0]).toMatchFileSnapshot("__snapshots__/i0-prompt.md");
});

test("the middleware records the first step so the next one has a predecessor", async () => {
  const store = memoryStore();
  await new StatefulReviewer(MODEL, store).review(request("i0", null, I0));
  expect(store.load("case-900/r1", "i0")).toEqual([]);
});

test("a later step carries the history, the diff since then, and the change tags", async () => {
  prompts.length = 0;
  const store = memoryStore();
  store.save("case-900/r1", "i0", PRIOR);
  await new StatefulReviewer(MODEL, store).review(request("i1", "i0", I1));

  await expect(prompts[0]).toMatchFileSnapshot("__snapshots__/i1-prompt.md");
});

test("a missing predecessor is a hard error, not a silent fall back to no history", async () => {
  prompts.length = 0;
  const reviewer = new StatefulReviewer(MODEL, memoryStore());
  await expect(reviewer.review(request("i1", "i0", I1))).rejects.toBeInstanceOf(LineageError);
  expect(prompts).toHaveLength(0);
});
