import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLlmConfig } from "./provider";

// Pure config tests — no network, no provider packages loaded.

const VARS = ["LLM_API_KEY", "LLM_PROVIDER", "LLM_MODEL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const v of VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
});
afterEach(() => {
  for (const v of VARS) {
    if (saved[v] === undefined) delete process.env[v];
    else process.env[v] = saved[v];
  }
});

describe("getLlmConfig", () => {
  it("is null with no key, so the app falls back to the rule-based generator", () => {
    expect(getLlmConfig()).toBeNull();
    process.env.LLM_API_KEY = "   ";
    expect(getLlmConfig()).toBeNull();
  });

  it("defaults to DeepSeek v4-pro when only a key is set", () => {
    process.env.LLM_API_KEY = "sk-test";
    expect(getLlmConfig()).toEqual({
      provider: "deepseek",
      model: "deepseek-v4-pro",
      apiKey: "sk-test",
    });
  });

  it("still supports anthropic with its own default model", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_PROVIDER = "Anthropic";
    expect(getLlmConfig()).toMatchObject({ provider: "anthropic", model: "claude-opus-5" });
  });

  it("lets LLM_MODEL override the default", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_MODEL = "deepseek-v4-flash";
    expect(getLlmConfig()).toMatchObject({ model: "deepseek-v4-flash" });
  });

  // The AI SDK's DeepSeekChatModelId type still offers both of these, so they
  // are exactly what someone picks from autocomplete — and they 404 at
  // generation time, minutes after the config looked fine.
  it.each([
    ["deepseek-chat", "deepseek-v4-flash"],
    ["deepseek-reasoner", "deepseek-v4-flash"],
  ])("rejects the retired model %s by name", (model, replacement) => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_MODEL = model;
    expect(() => getLlmConfig()).toThrow(new RegExp(`retired.*${replacement}`));
  });

  it("does not reject those names under a different provider", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_PROVIDER = "anthropic";
    process.env.LLM_MODEL = "deepseek-chat";
    expect(() => getLlmConfig()).not.toThrow();
  });

  it("demands a model for a provider it has no default for", () => {
    process.env.LLM_API_KEY = "sk-test";
    process.env.LLM_PROVIDER = "mystery";
    expect(() => getLlmConfig()).toThrow(/LLM_MODEL must be set/);
  });
});
