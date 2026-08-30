import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateText, type LanguageModel } from "ai";
import { z } from "zod";

/** extracted from generateText's own type, always matches what the sdk expects */
type ProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];

export const ProviderSchema = z.enum(["openai", "google", "openrouter"]);
export type Provider = z.infer<typeof ProviderSchema>;

/** the intersection all three providers accept, openrouter alone has more levels */
export const EffortSchema = z.enum(["low", "medium", "high"]);
export type Effort = z.infer<typeof EffortSchema>;

/** each provider reads its own named env var, not an sdk default */
export const PROVIDER_API_KEY_ENV: Record<Provider, string> = {
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export function resolveModel(provider: Provider, apiKey: string, modelId: string): LanguageModel {
  if (provider === "openai") return createOpenAI({ apiKey }).chat(modelId);
  if (provider === "google") return createGoogle({ apiKey }).chat(modelId);
  // openrouter model ids are namespaced, e.g. "deepseek/deepseek-v4-flash"
  if (provider === "openrouter") return createOpenRouter({ apiKey }).chat(modelId);
  throw new Error(`unknown provider "${provider}"`);
}

/** google is forced to a level, its flash-lite tier barely thinks otherwise. others send nothing unless pinned */
export function defaultProviderOptions(provider: Provider, effort?: Effort): ProviderOptions {
  if (provider === "google")
    return { google: { thinkingConfig: { thinkingLevel: effort ?? "medium" } } };
  if (effort === undefined) return undefined;
  if (provider === "openrouter") return { openrouter: { reasoning: { effort } } };
  if (provider === "openai") return { openai: { reasoningEffort: effort } };
  return undefined;
}
