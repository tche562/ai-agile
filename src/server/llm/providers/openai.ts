import OpenAI from "openai";
import { z } from "zod";

import type { LLMClient } from "../client";
import type { GenerateJSONParams, GenerateJSONResult } from "../types";
import { LLMConfigurationError } from "../types";
import { buildJsonOnlyPrompt, normalizeUsage, parseAndValidateJson } from "../utils";

const DEFAULT_OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

export class OpenAIClient implements LLMClient {
  private client: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new LLMConfigurationError("Missing OPENAI_API_KEY.");
    }

    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>
  ): Promise<GenerateJSONResult<TSchema>> {
    const model = params.meta?.model || DEFAULT_OPENAI_MODEL;
    const temperature = params.meta?.temperature ?? 0;

    const { systemPrompt, userPrompt } = buildJsonOnlyPrompt({
      system: params.system,
      user: params.user,
      schema: params.schema,
    });

    const completion = await this.client.chat.completions.create({
      model,
      temperature,
      messages: [
        {
          role: "developer",
          content: systemPrompt,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const rawText = completion.choices[0]?.message?.content?.trim() ?? "";

    const object = parseAndValidateJson({
      rawText,
      schema: params.schema,
      provider: "openai",
      model,
    });

    return {
      object,
      rawText,
      provider: "openai",
      model,
      usage: normalizeUsage({
        prompt_tokens: completion.usage?.prompt_tokens,
        completion_tokens: completion.usage?.completion_tokens,
        total_tokens: completion.usage?.total_tokens,
      }),
    };
  }
}