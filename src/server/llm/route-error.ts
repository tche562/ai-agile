import { NextResponse } from "next/server";

import { DailyQuotaExceededError } from "./errors";
import { LLMRateLimitError } from "./types";
import { logRuntimeWarning } from "../observability/logger";

type ProviderErrorInfo = {
  name?: string;
  status?: number;
  code?: string;
  causeCode?: string;
};

type LLMErrorResponseContext = {
  route?: string;
  operation?: string;
  runId?: string;
  projectId?: string;
  ticketId?: string;
  userId?: string;
};

export type { LLMErrorResponseContext };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getNestedCauseCode(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return readString(value.code) ?? getNestedCauseCode(value.cause);
}

function getProviderErrorInfo(error: unknown): ProviderErrorInfo | null {
  if (!isRecord(error)) {
    return null;
  }

  const nestedError = isRecord(error.error) ? error.error : null;
  const causeCode = getNestedCauseCode(error.cause);
  const info = {
    name: readString(error.name),
    status: readNumber(error.status),
    code: readString(nestedError?.code) ?? readString(error.code),
    causeCode,
  };

  if (!info.name && !info.status && !info.code && !info.causeCode) {
    return null;
  }

  return info;
}

function getRunId(error: unknown, context: LLMErrorResponseContext): string | undefined {
  if (context.runId) {
    return context.runId;
  }

  if (!isRecord(error)) {
    return undefined;
  }

  return readString(error.runId);
}

/**
 * Future LLM API routes should use this helper to return safe quota errors.
 */
export function llmErrorToResponse(
  error: unknown,
  context: LLMErrorResponseContext = {},
): NextResponse | null {
  if (error instanceof DailyQuotaExceededError) {
    const runId = getRunId(error, context);

    logRuntimeWarning({
      event: "daily_quota_exceeded",
      message: "Route mapped daily quota error to HTTP 429",
      context: {
        operation: context.operation ?? "llm.route_error_mapping",
        route: context.route,
        runId,
        userId: context.userId ?? error.userId,
        projectId: context.projectId ?? error.projectId,
        ticketId: context.ticketId,
        statusCode: 429,
      },
      error,
    });
    return NextResponse.json(
      { error: "Daily LLM quota exceeded", ...(runId ? { runId } : {}) },
      { status: 429 },
    );
  }

  if (error instanceof LLMRateLimitError) {
    const runId = getRunId(error, context);

    logRuntimeWarning({
      event: "rate_limit_exceeded",
      message: "Route mapped LLM rate limit error to HTTP 429",
      context: {
        operation: context.operation ?? "llm.route_error_mapping",
        route: context.route,
        runId,
        userId: context.userId,
        projectId: context.projectId,
        ticketId: context.ticketId,
        statusCode: 429,
        provider: error.provider,
        limit: error.limit,
        remaining: error.remaining,
      },
      error,
    });
    return NextResponse.json(
      { error: "LLM rate limit exceeded", ...(runId ? { runId } : {}) },
      {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      },
    );
  }

  const providerError = getProviderErrorInfo(error);
  if (
    providerError?.name === "APIConnectionError" ||
    providerError?.causeCode === "ETIMEDOUT" ||
    providerError?.causeCode === "ECONNREFUSED" ||
    providerError?.causeCode === "ENOTFOUND"
  ) {
    return NextResponse.json(
      {
        error:
          "LLM provider is unreachable from this network. Check your proxy or switch provider.",
      },
      { status: 502 },
    );
  }

  if (providerError?.code === "unsupported_country_region_territory") {
    return NextResponse.json(
      {
        error:
          "LLM provider is not available from this region or network. Configure a supported proxy or switch provider.",
      },
      { status: 502 },
    );
  }

  if (
    providerError?.status === 401 ||
    providerError?.status === 403 ||
    providerError?.status === 429 ||
    (providerError?.status !== undefined && providerError.status >= 500)
  ) {
    return NextResponse.json({ error: "LLM provider request failed" }, { status: 502 });
  }

  return null;
}
