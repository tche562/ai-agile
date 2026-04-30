import { GatewayLLMClient, type LLMClient } from "./client";
import type { LLMProvider } from "./types";
import { AnthropicProviderAdapter } from "./providers/anthropic";
import { OpenAIProviderAdapter } from "./providers/openai";

export function createLLMClient(provider: LLMProvider): LLMClient {
  switch (provider) {
    case "openai":
      return new GatewayLLMClient(new OpenAIProviderAdapter());
    case "anthropic":
      return new GatewayLLMClient(new AnthropicProviderAdapter());
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
}
