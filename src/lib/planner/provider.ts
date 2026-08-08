import "server-only";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";

// LLM provider wiring for plan generation.
//
// The provider is read from the environment so the choice stays a deployment
// decision rather than a code change. Nothing here is required for the app to
// work: with no key configured, generation falls back to the deterministic
// rule-based generator (see generate.ts).

const DEFAULT_PROVIDER = "deepseek";

const DEFAULT_MODEL: Record<string, string> = {
  // deepseek-v4-pro over v4-flash: at roughly 5k input + 6k output tokens a
  // plan, pro costs about $0.007 against flash's $0.002. Both are a fraction of
  // a cent, so plan quality wins. Override with LLM_MODEL=deepseek-v4-flash.
  deepseek: "deepseek-v4-pro",
  anthropic: "claude-opus-5",
};

/**
 * Model ids DeepSeek retired on 2026-07-24. They were never separate models —
 * `deepseek-chat` was the non-thinking mode of the then-current generation and
 * `deepseek-reasoner` the thinking mode, both resolving to deepseek-v4-flash.
 * There is no redirect: a request naming either now fails as an unknown model.
 *
 * Worth catching by name because the AI SDK's own DeepSeekChatModelId type
 * still lists both, so copying the obvious value from editor autocomplete
 * produces a config that looks right and 404s at generation time.
 */
const RETIRED_DEEPSEEK_MODELS: Record<string, string> = {
  "deepseek-chat": "deepseek-v4-flash (with LLM_THINKING=disabled)",
  "deepseek-reasoner": "deepseek-v4-flash (with LLM_THINKING=enabled)",
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

  const provider = (process.env.LLM_PROVIDER?.trim() || DEFAULT_PROVIDER).toLowerCase();
  const model = process.env.LLM_MODEL?.trim() || DEFAULT_MODEL[provider];
  if (!model) {
    throw new Error(`LLM_MODEL must be set for provider "${provider}".`);
  }

  const replacement = provider === "deepseek" ? RETIRED_DEEPSEEK_MODELS[model] : undefined;
  if (replacement) {
    throw new Error(
      `LLM_MODEL "${model}" was retired by DeepSeek on 2026-07-24 and no longer resolves. Use ${replacement}.`,
    );
  }

  return { provider, model, apiKey };
}

/**
 * Per-provider request options.
 *
 * DeepSeek V4 exposes a thinking mode as a request option rather than as a
 * separate model. "adaptive" lets the model decide, which suits plan generation:
 * a simple 2-day full-body request does not need deliberation, a 6-day split
 * under a session-length budget does.
 */
function providerOptions(config: LlmConfig): SharedV4ProviderOptions | undefined {
  if (config.provider !== "deepseek") return undefined;

  const thinking = process.env.LLM_THINKING?.trim() || "adaptive";
  const effort = process.env.LLM_REASONING_EFFORT?.trim();

  return {
    deepseek: {
      thinking: { type: thinking },
      ...(effort ? { reasoningEffort: effort } : {}),
      // Only takes effect if the provider negotiates json_schema output; see
      // the note in generate.ts about DeepSeek falling back to json_object.
      strictJsonSchema: true,
    },
  };
}

export interface ResolvedModel {
  model: LanguageModel;
  providerOptions?: SharedV4ProviderOptions;
}

/**
 * Resolves the configured provider to an AI SDK model.
 *
 * The provider package is imported dynamically so that adding a second provider
 * later never makes the first one a hard build dependency, and so a
 * misconfigured provider name fails with a clear message instead of a module
 * resolution error at startup.
 */
export async function resolveModel(config: LlmConfig): Promise<ResolvedModel> {
  if (config.provider === "deepseek") {
    const { createDeepSeek } = await import("@ai-sdk/deepseek");
    return {
      model: createDeepSeek({ apiKey: config.apiKey })(config.model),
      providerOptions: providerOptions(config),
    };
  }
  if (config.provider === "anthropic") {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    return { model: createAnthropic({ apiKey: config.apiKey })(config.model) };
  }
  throw new Error(
    `Unsupported LLM_PROVIDER "${config.provider}". Supported: ${Object.keys(DEFAULT_MODEL).join(", ")}.`,
  );
}
