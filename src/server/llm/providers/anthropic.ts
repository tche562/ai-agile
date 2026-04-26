import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import type { LLMClient } from "../client";
import type { GenerateJSONParams, GenerateJSONResult } from "../types";
import { LLMConfigurationError } from "../types";
import { buildJsonOnlyPrompt, normalizeUsage, parseAndValidateJson } from "../utils";

const DEFAULT_ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";

export class AnthropicClient implements LLMClient {
  private client: Anthropic;

  constructor() {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new LLMConfigurationError("Missing ANTHROPIC_API_KEY.");
    }

    this.client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  async generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>
  ): Promise<GenerateJSONResult<TSchema>> {
    const model = params.meta?.model || DEFAULT_ANTHROPIC_MODEL;
    const temperature = params.meta?.temperature ?? 0;

    const { systemPrompt, userPrompt } = buildJsonOnlyPrompt({
      system: params.system,
      user: params.user,
      schema: params.schema,
    });

    const message = await this.client.messages.create({
      model,
      temperature,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    const rawText = message.content
      .filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n")
      .trim();

    const object = parseAndValidateJson({
      rawText,
      schema: params.schema,
      provider: "anthropic",
      model,
    });

    return {
      object,
      rawText,
      provider: "anthropic",
      model,
      usage: normalizeUsage({
        input_tokens: message.usage?.input_tokens,
        output_tokens: message.usage?.output_tokens,
      }),
    };
  }
}