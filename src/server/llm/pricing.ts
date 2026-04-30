import type { LLMProvider } from "./types";

type PricingRule = {
  provider: LLMProvider;
  modelPrefix: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

const PRICING_RULES: PricingRule[] = [
  {
    provider: "openai",
    modelPrefix: "gpt-5.2",
    inputPerMillionUsd: 5,
    outputPerMillionUsd: 15,
  },
  {
    provider: "openai",
    modelPrefix: "gpt-4o",
    inputPerMillionUsd: 5,
    outputPerMillionUsd: 15,
  },
  {
    provider: "anthropic",
    modelPrefix: "claude-sonnet-4-5",
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
  },
  {
    provider: "anthropic",
    modelPrefix: "claude-3-7-sonnet",
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
  },
];

function sanitizeTokens(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function findPricingRule(provider: LLMProvider, model: string): PricingRule | undefined {
  const normalized = model.trim().toLowerCase();

  return PRICING_RULES.find(
    (rule) =>
      rule.provider === provider &&
      (normalized === rule.modelPrefix || normalized.startsWith(`${rule.modelPrefix}-`)),
  );
}

export function estimateLLMCostUsd(args: {
  provider: LLMProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const rule = findPricingRule(args.provider, args.model);

  if (!rule) {
    return 0;
  }

  const inputTokens = sanitizeTokens(args.inputTokens);
  const outputTokens = sanitizeTokens(args.outputTokens);

  const inputCost = (inputTokens / 1_000_000) * rule.inputPerMillionUsd;
  const outputCost = (outputTokens / 1_000_000) * rule.outputPerMillionUsd;

  return Number((inputCost + outputCost).toFixed(8));
}
