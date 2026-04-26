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
});
