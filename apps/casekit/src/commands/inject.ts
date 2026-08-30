import { Command, Option } from "commander";
import { float, positiveInt } from "casekit-core";
import { EffortSchema, ProviderSchema } from "model-client";
import { injectCase } from "../lib/inject/index.js";
import { logger } from "logger";
import type { DatasetDir } from "./shared.js";

interface InjectOpts {
  case: string;
  slot?: string;
  provider: string;
  model: string;
  temperature: number;
  effort?: string;
  maxAttempts: number;
}

export function registerInject(program: Command, datasetDir: DatasetDir): void {
  program
    .command("inject")
    .description(
      "generate all five findings for a case, F1-F4 defects plus F5 cosmetic finding",
    )
    .requiredOption("--case <id>", "case id")
    .option("--slot <slot>", "regenerate one existing slot (F1-F5) instead of all five")
    .addOption(new Option("--provider <provider>", "openai | google").default("google"))
    .requiredOption("--model <id>", "model id, no default, pin it explicitly per call")
    .option("--temperature <n>", "sampling temperature", float, 1)
    .addOption(
      new Option("--effort <level>", "reasoning depth (default: provider/model default)").choices(
        EffortSchema.options,
      ),
    )
    .option(
      "--max-attempts <n>",
      "retries against validation/typecheck failures before giving up",
      positiveInt,
      3,
    )
    .action(async (opts: InjectOpts) => {
      const dir = datasetDir();
      const provider = ProviderSchema.parse(opts.provider);
      const effort = opts.effort ? EffortSchema.parse(opts.effort) : undefined;
      try {
        await injectCase(dir, opts.case, {
          provider,
          model: opts.model,
          temperature: opts.temperature,
          effort,
          maxAttempts: opts.maxAttempts,
          slot: opts.slot,
        });
      } catch (error) {
        logger.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
