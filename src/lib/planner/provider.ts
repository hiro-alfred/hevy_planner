import "server-only";
import type { LanguageModel } from "ai";

// LLM provider wiring for plan generation.
//
// The provider is read from the environment so the choice stays a deployment
// decision rather than a code change (still an open question — see
// knowledge/hot.md). Nothing here is required for the app to work: with no key
// configured, generation falls back to the deterministic rule-based generator.

const DEFAULT_MODEL: Record<string, string> = {
  anthropic: "claude-opus-5",
};

export interface LlmConfig {
  provider: string;
  model: string;
  apiKey: string;
}

/** Reads LLM_* from the environment. Null means "no provider configured". */
export function getLlmConfig(): LlmConfig | null {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) return null;

  const provider = (process.env.LLM_PROVIDER?.trim() || "anthropic").toLowerCase();
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL[provider];
  if (!model) {
    throw new Error(`LLM_MODEL must be set for provider "${provider}".`);
  }
  return { provider, model, apiKey };
}

/**
 * Resolves the configured provider to an AI SDK model.
 *
 * The provider package is imported dynamically so that adding a second provider
 * later never makes the first one a hard build dependency, and so a
 * misconfigured provider name fails with a clear message instead of a module
 * resolution error at startup.
 */
export async function resolveModel(config: LlmConfig): Promise<LanguageModel> {
  if (config.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    return createAnthropic({ apiKey: config.apiKey })(config.model);
  }
  throw new Error(
    `Unsupported LLM_PROVIDER "${config.provider}". Supported: ${Object.keys(DEFAULT_MODEL).join(", ")}.`,
  );
}
