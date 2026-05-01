import { NextResponse } from "next/server";

import { DailyQuotaExceededError } from "./errors";
import { LLMRateLimitError } from "./types";

/**
 * Future LLM API routes should use this helper to return safe quota errors.
 */
export function llmErrorToResponse(error: unknown): NextResponse | null {
  if (error instanceof DailyQuotaExceededError) {
    return NextResponse.json({ error: "Daily LLM quota exceeded" }, { status: 429 });
  }

  if (error instanceof LLMRateLimitError) {
    return NextResponse.json(
      { error: "LLM rate limit exceeded" },
      {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      },
    );
  }

  return null;
}
