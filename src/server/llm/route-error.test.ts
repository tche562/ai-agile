import { describe, expect, it } from "vitest";
import { vi } from "vitest";

import { DailyQuotaExceededError } from "./errors";
import { llmErrorToResponse } from "./route-error";
import { LLMRateLimitError } from "./types";

const { mockLogRuntimeWarning } = vi.hoisted(() => ({
  mockLogRuntimeWarning: vi.fn(),
}));

vi.mock("../observability/logger", () => ({
  logRuntimeWarning: mockLogRuntimeWarning,
}));

describe("llmErrorToResponse", () => {
  it("maps DailyQuotaExceededError to HTTP 429 safely", async () => {
    const response = llmErrorToResponse(
      new DailyQuotaExceededError({
        userId: "user-1",
        projectId: "project-1",
        reason: "Project daily token quota exceeded",
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
    await expect(response?.json()).resolves.toEqual({
      error: "Daily LLM quota exceeded",
    });
    expect(mockLogRuntimeWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "daily_quota_exceeded",
      }),
    );
  });

  it("returns null for unrelated errors", () => {
    expect(llmErrorToResponse(new Error("other"))).toBeNull();
  });

  it("maps LLMRateLimitError to HTTP 429 safely", async () => {
    const response = llmErrorToResponse(
      new LLMRateLimitError({
        identifier: "user-1:project-1",
        limit: 5,
        remaining: 0,
        reset: 1_774_000_000,
        retryAfterSeconds: 60,
      }),
    );

    expect(response).not.toBeNull();
    expect(response?.status).toBe(429);
    expect(response?.headers.get("Retry-After")).toBe("60");
    await expect(response?.json()).resolves.toEqual({
      error: "LLM rate limit exceeded",
    });
    expect(mockLogRuntimeWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "rate_limit_exceeded",
      }),
    );
  });

  it("includes runId in safe 429 body when context provides it", async () => {
    const response = llmErrorToResponse(
      new LLMRateLimitError({
        identifier: "user-1:project-1",
        limit: 5,
        remaining: 0,
        reset: 1_774_000_000,
        retryAfterSeconds: 60,
      }),
      {
        runId: "run-1",
        route: "POST /api/projects/[projectId]/orchestrator/replan",
      },
    );

    expect(response).not.toBeNull();
    await expect(response?.json()).resolves.toEqual({
      error: "LLM rate limit exceeded",
      runId: "run-1",
    });
  });

  it("maps provider connection failures to an actionable HTTP 502", async () => {
    const response = llmErrorToResponse({
      name: "APIConnectionError",
      cause: {
        cause: {
          code: "ETIMEDOUT",
        },
      },
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error: "LLM provider is unreachable from this network. Check your proxy or switch provider.",
    });
  });

  it("maps unsupported provider regions to an actionable HTTP 502", async () => {
    const response = llmErrorToResponse({
      status: 403,
      error: {
        code: "unsupported_country_region_territory",
        message: "Country, region, or territory not supported",
      },
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error:
        "LLM provider is not available from this region or network. Configure a supported proxy or switch provider.",
    });
  });

  it("maps provider auth and upstream failures to safe HTTP 502", async () => {
    const response = llmErrorToResponse({
      status: 403,
      error: {
        code: "request_forbidden",
        message: "Forbidden",
      },
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(502);
    await expect(response?.json()).resolves.toEqual({
      error: "LLM provider request failed",
    });
  });
});
