import { z } from "zod";

export type LLMProvider = "openai" | "anthropic";

export type LLMGenerateJSONMeta = {
  userId?: string;
  projectId?: string;
  runId?: string;
  model?: string;
  temperature?: number;
};

export type GenerateJSONParams<TSchema extends z.ZodTypeAny> = {
  system: string;
  user: string;
  schema: TSchema;
  meta?: LLMGenerateJSONMeta;
};

export type LLMUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

export type GenerateJSONResult<TSchema extends z.ZodTypeAny> = {
  object: z.infer<TSchema>;
  rawText: string;
  provider: LLMProvider;
  model: string;
  usage?: LLMUsage;
};

export class LLMOutputParseError extends Error {
  provider: LLMProvider;
  model: string;
  rawText: string;

  constructor(args: { provider: LLMProvider; model: string; rawText: string; message?: string }) {
    super(args.message ?? "Failed to parse model output as valid JSON.");
    this.name = "LLMOutputParseError";
    this.provider = args.provider;
    this.model = args.model;
    this.rawText = args.rawText;
  }
}

export class LLMConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LLMConfigurationError";
  }
}
