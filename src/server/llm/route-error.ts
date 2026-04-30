import { NextResponse } from "next/server";

import { DailyQuotaExceededError } from "./errors";

/**
 * Future LLM API routes should use this helper to return safe quota errors.
 */
export function llmErrorToResponse(error: unknown): NextResponse | null {
  if (error instanceof DailyQuotaExceededError) {
    return NextResponse.json({ error: "Daily LLM quota exceeded" }, { status: 429 });
  }

  return null;
}
