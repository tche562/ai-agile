import { describe, expect, it } from "vitest";

import { estimateLLMCostUsd } from "./pricing";

describe("estimateLLMCostUsd", () => {
  it("returns 0 for unknown model", () => {
    const cost = estimateLLMCostUsd({
      provider: "openai",
      model: "unknown-model",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(cost).toBe(0);
  });

  it("estimates DeepSeek chat costs", () => {
    const cost = estimateLLMCostUsd({
      provider: "deepseek",
      model: "deepseek-chat",
      inputTokens: 1_000_000,
      outputTokens: 500_000,
    });

    expect(cost).toBe(0.28);
  });
});
