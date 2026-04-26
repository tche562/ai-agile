import Anthropic from "@anthropic-ai/sdk";

import type { LLMProviderAdapter, ProviderCallParams, ProviderCallResult } from "../client";
import { LLMConfigurationError } from "../types";
import { normalizeUsage } from "../utils";

const DEFAULT_ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export class AnthropicProviderAdapter implements LLMProviderAdapter {
  provider = "anthropic" as const;
  defaultModel = DEFAULT_ANTHROPIC_MODEL;
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new LLMConfigurationError("Missing ANTHROPIC_API_KEY.");
    }

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateRawText(params: ProviderCallParams): Promise<ProviderCallResult> {
    const message = await this.client.messages.create({
      model: params.model,
      temperature: params.temperature,
      max_tokens: 2000,
      system: params.systemPrompt,
      messages: [
        {
          role: "user",
          content: params.userPrompt,
        },
      ],
    });

    const rawText = message.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();
    const usage = normalizeUsage({
      input_tokens: message.usage?.input_tokens,
      output_tokens: message.usage?.output_tokens,
    });

    return {
      provider: this.provider,
      model: params.model,
      rawText,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    };
  }
}
