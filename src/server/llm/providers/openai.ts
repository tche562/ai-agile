import OpenAI from "openai";

import type { LLMProviderAdapter, ProviderCallParams, ProviderCallResult } from "../client";
import { LLMConfigurationError } from "../types";
import { normalizeUsage } from "../utils";

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

export class OpenAIProviderAdapter implements LLMProviderAdapter {
  provider = "openai" as const;
  defaultModel = DEFAULT_OPENAI_MODEL;
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new LLMConfigurationError("Missing OPENAI_API_KEY.");
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateRawText(params: ProviderCallParams): Promise<ProviderCallResult> {
    const completion = await this.client.chat.completions.create({
      model: params.model,
      temperature: params.temperature,
      messages: [
        {
          role: "developer",
          content: params.systemPrompt,
        },
        {
          role: "user",
          content: params.userPrompt,
        },
      ],
    });

    const usage = normalizeUsage({
      prompt_tokens: completion.usage?.prompt_tokens,
      completion_tokens: completion.usage?.completion_tokens,
      total_tokens: completion.usage?.total_tokens,
    });

    return {
      provider: this.provider,
      model: params.model,
      rawText: completion.choices[0]?.message?.content?.trim() ?? "",
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
    };
  }
}
