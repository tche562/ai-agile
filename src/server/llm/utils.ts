import { z } from "zod";
import { LLMOutputParseError, type LLMProvider, type LLMUsage } from "./types";

export function buildJsonOnlyPrompt(args: {
  system: string;
  user: string;
  schema: z.ZodTypeAny;
}): { systemPrompt: string; userPrompt: string } {
  const shapeHint = JSON.stringify(
    z.toJSONSchema(args.schema, { target: "draft-7" }),
    null,
    2
  );

  const systemPrompt = [
    args.system.trim(),
    "",
    "You must return only valid JSON.",
    "Do not wrap the JSON in markdown fences.",
    "Do not include commentary, explanation, headings, or extra text.",
    "The JSON must conform to this schema:",
    shapeHint,
  ].join("\n");

  const userPrompt = args.user.trim();

  return { systemPrompt, userPrompt };
}

export function extractJsonText(rawText: string): string {
  const trimmed = rawText.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("```")) {
    const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return trimmed;
}

export function parseAndValidateJson<TSchema extends z.ZodTypeAny>(args: {
  rawText: string;
  schema: TSchema;
  provider: LLMProvider;
  model: string;
}): z.infer<TSchema> {
  const jsonText = extractJsonText(args.rawText);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new LLMOutputParseError({
      provider: args.provider,
      model: args.model,
      rawText: args.rawText,
      message: "Model output was not valid JSON.",
    });
  }

  const result = args.schema.safeParse(parsed);

  if (!result.success) {
    throw new LLMOutputParseError({
      provider: args.provider,
      model: args.model,
      rawText: args.rawText,
      message: `JSON parsed, but failed schema validation: ${result.error.message}`,
    });
  }

  return result.data;
}

export function normalizeUsage(usage?: {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
}): LLMUsage | undefined {
  if (!usage) return undefined;

  const inputTokens = usage.input_tokens ?? usage.prompt_tokens;
  const outputTokens = usage.output_tokens ?? usage.completion_tokens;
  const totalTokens =
    usage.total_tokens ??
    (typeof inputTokens === "number" && typeof outputTokens === "number"
      ? inputTokens + outputTokens
      : undefined);

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}