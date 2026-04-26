import type { LLMClient } from "./client";
import type { LLMProvider } from "./types";
import { AnthropicClient } from "./providers/anthropic";
import { OpenAIClient } from "./providers/openai";

export function createLLMClient(provider: LLMProvider): LLMClient {
  switch (provider) {
    case "openai":
      return new OpenAIClient();
    case "anthropic":
      return new AnthropicClient();
    default: {
      const exhaustiveCheck: never = provider;
      throw new Error(`Unsupported provider: ${exhaustiveCheck}`);
    }
  }
}
