import { z } from "zod";
import type { GenerateJSONParams, GenerateJSONResult } from "./types";

export interface LLMClient {
  generateJSON<TSchema extends z.ZodTypeAny>(
    params: GenerateJSONParams<TSchema>
  ): Promise<GenerateJSONResult<TSchema>>;
}