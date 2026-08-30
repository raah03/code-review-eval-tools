import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  generateText,
  type FlexibleSchema,
  type LanguageModelUsage,
} from "ai";
import { defaultProviderOptions, resolveModel, type Effort, type Provider } from "./provider.js";

/** leaves room for reasoning plus the output */
const DEFAULT_MAX_OUTPUT_TOKENS = 64_000;

export interface CallModelOptions<T> {
  provider: Provider;
  apiKey: string;
  model: string;
  temperature: number;
  /** unset uses each provider's default (google: medium) */
  effort?: Effort;
  maxOutputTokens?: number;
  prompt: string;
  schema: FlexibleSchema<T>;
  maxRetries?: number;
}

/** reasoning_tokens and cache_read_tokens are already included, don't add them again */
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
}

export interface ModelCallResult<T> {
  output: T;
  raw: string;
  usage: TokenUsage;
  latency_ms: number;
}

/** thrown on schema mismatch, not transport failures, the sdk retries those */
export class ModelCallFailure extends Error {
  constructor(
    readonly raw: string,
    readonly usage: TokenUsage,
    readonly latency_ms: number,
  ) {
    super("model did not produce a schema-valid object");
  }
}

/** folds a failed attempt's tokens into the retry so nothing charged is lost */
export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    reasoning_tokens: a.reasoning_tokens + b.reasoning_tokens,
    cache_read_tokens: a.cache_read_tokens + b.cache_read_tokens,
    cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,
  };
}

/** providers with no breakdown just get zeros */
function tokenUsage(usage: LanguageModelUsage | undefined): TokenUsage {
  return {
    input_tokens: usage?.inputTokens ?? 0,
    output_tokens: usage?.outputTokens ?? 0,
    reasoning_tokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
    cache_read_tokens: usage?.inputTokenDetails?.cacheReadTokens ?? 0,
    cache_write_tokens: usage?.inputTokenDetails?.cacheWriteTokens ?? 0,
  };
}

/** generateObject is deprecated, uses generateText plus Output.object instead */
export async function callModel<T>(options: CallModelOptions<T>): Promise<ModelCallResult<T>> {
  const model = resolveModel(options.provider, options.apiKey, options.model);
  const start = Date.now();
  try {
    const result = await generateText({
      model,
      prompt: options.prompt,
      temperature: options.temperature,
      maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
      maxRetries: options.maxRetries ?? 3,
      output: Output.object({ schema: options.schema }),
      providerOptions: defaultProviderOptions(options.provider, options.effort),
    });
    // read first, output throws on an empty completion and we'd lose these otherwise
    const usage = tokenUsage(result.usage);
    const raw = result.text;
    try {
      return { output: result.output, raw, usage, latency_ms: Date.now() - start };
    } catch (error) {
      if (NoOutputGeneratedError.isInstance(error)) {
        throw new ModelCallFailure(raw, usage, Date.now() - start);
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof ModelCallFailure) throw error;
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new ModelCallFailure(error.text ?? "", tokenUsage(error.usage), Date.now() - start);
    }
    throw error;
  }
}
