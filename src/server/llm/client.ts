import { z } from "zod";
import type { GenerateJSONParams, GenerateJSONResult } from "./types";
import { enforceLLMRateLimit } from "./ratelimit";
import { generateJSONWithRetry } from "./retry";
import { assertDailyLLMQuota, recordLLMUsage } from "./usage";
import { buildJsonOnlyPrompt, buildUserPromptForAttempt } from "./utils";

export interface LLMClient {
  generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>,
  ): Promise<GenerateJSONResult<TSchema>>;
}

export type ProviderCallParams = {
  model: string;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
};

export type ProviderCallResult = {
  provider: "openai" | "anthropic";
  model: string;
  rawText: string;
  inputTokens: number;
  outputTokens: number;
};

export interface LLMProviderAdapter {
  provider: "openai" | "anthropic";
  defaultModel: string;
  generateRawText(params: ProviderCallParams): Promise<ProviderCallResult>;
}

export class GatewayLLMClient implements LLMClient {
  constructor(private readonly adapter: LLMProviderAdapter) {}

  async generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>,
  ): Promise<GenerateJSONResult<TSchema>> {
    const model = params.meta.model ?? this.adapter.defaultModel;
    const temperature = params.meta.temperature ?? 0;

    const rateLimit = await enforceLLMRateLimit({
      userId: params.meta.userId,
      projectId: params.meta.projectId,
      provider: this.adapter.provider,
    });

    const { systemPrompt, userPrompt } = buildJsonOnlyPrompt({
      system: params.system,
      user: params.user,
      schema: params.schema,
    });

    const result = await generateJSONWithRetry({
      provider: this.adapter.provider,
      model,
      schema: params.schema,
      maxRetries: params.meta.maxRetries,
      generateRawText: async (retryContext) => {
        await assertDailyLLMQuota({
          userId: params.meta.userId,
          projectId: params.meta.projectId,
        });

        const providerResult = await this.adapter.generateRawText({
          model,
          temperature,
          systemPrompt,
          userPrompt: buildUserPromptForAttempt({
            userPrompt,
            attempt: retryContext.attempt,
            previousError: retryContext.previousError,
          }),
        });

        await recordLLMUsage({
          runId: params.meta.runId,
          userId: params.meta.userId,
          projectId: params.meta.projectId,
          provider: providerResult.provider,
          model: providerResult.model,
          inputTokens: providerResult.inputTokens,
          outputTokens: providerResult.outputTokens,
        });

        return {
          rawText: providerResult.rawText,
          usage: {
            inputTokens: providerResult.inputTokens,
            outputTokens: providerResult.outputTokens,
            totalTokens: providerResult.inputTokens + providerResult.outputTokens,
          },
        };
      },
    });

    return {
      ...result,
      rateLimit,
    };
  }
}
