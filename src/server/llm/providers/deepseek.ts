import OpenAI from "openai";

import type { LLMProviderAdapter, ProviderCallParams, ProviderCallResult } from "../client";
import { LLMConfigurationError } from "../types";
import { normalizeUsage } from "../utils";

const DEFAULT_DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const DEFAULT_DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

export class DeepSeekProviderAdapter implements LLMProviderAdapter {
  provider = "deepseek" as const;
  defaultModel = DEFAULT_DEEPSEEK_MODEL;
  private client: OpenAI;

  constructor() {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new LLMConfigurationError("Missing DEEPSEEK_API_KEY.");
    }

    this.client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: DEFAULT_DEEPSEEK_BASE_URL,
    });
  }

  async generateRawText(params: ProviderCallParams): Promise<ProviderCallResult> {
    const completion = await this.client.chat.completions.create({
      model: params.model,
      temperature: params.temperature,
      messages: [
        {
          role: "system",
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
