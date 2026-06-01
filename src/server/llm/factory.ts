import { GatewayLLMClient, type LLMClient } from "./client";
import type { LLMProvider } from "./types";
import { AnthropicProviderAdapter } from "./providers/anthropic";
import { DeepSeekProviderAdapter } from "./providers/deepseek";
import { OpenAIProviderAdapter } from "./providers/openai";
import { TestProviderAdapter } from "./providers/test";

export function createLLMClient(provider: LLMProvider): LLMClient {
  switch (provider) {
    case "openai":
      return new GatewayLLMClient(new OpenAIProviderAdapter());
    case "anthropic":
      return new GatewayLLMClient(new AnthropicProviderAdapter());
    case "deepseek":
      return new GatewayLLMClient(new DeepSeekProviderAdapter());
    case "test":
      return new GatewayLLMClient(new TestProviderAdapter());
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
}
