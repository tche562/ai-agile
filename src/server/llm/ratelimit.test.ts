import { describe, expect, it } from "vitest";
import {
  buildLLMRateLimitIdentifier,
  createRateLimitErrorHeaders,
  createRateLimitHeaders,
  enforceLLMRateLimitWithLimitFn,
} from "./ratelimit";
import { LLMConfigurationError, LLMRateLimitError, type LLMRateLimitInfo } from "./types";

describe("LLM ratelimit", () => {
  it("builds identifier by user and project", () => {
    expect(
      buildLLMRateLimitIdentifier({
        userId: "user-1",
        projectId: "project-1",
      }),
    ).toBe("llm:user:user-1:project:project-1");
  });

  it("throws when userId is missing", () => {
    expect(() =>
      buildLLMRateLimitIdentifier({
        projectId: "project-1",
      }),
    ).toThrow(LLMConfigurationError);
  });

  it("throws when projectId is missing", () => {
    expect(() =>
      buildLLMRateLimitIdentifier({
        userId: "user-1",
      }),
    ).toThrow(LLMConfigurationError);
  });

  it("skips check when disabled", async () => {
    const result = await enforceLLMRateLimitWithLimitFn(
      {
        userId: "user-1",
        projectId: "project-1",
        enabled: false,
      },
      async () => {
        throw new Error("limit function should not be called");
      },
    );

    expect(result).toBeUndefined();
  });

  it("returns rate limit info when allowed", async () => {
    const result = await enforceLLMRateLimitWithLimitFn(
      {
        userId: "user-1",
        projectId: "project-1",
        enabled: true,
      },
      async () => ({
        success: true,
        limit: 5,
        remaining: 4,
        reset: 123456789,
      }),
    );

    expect(result).toEqual({
      identifier: "llm:user:user-1:project:project-1",
      limit: 5,
      remaining: 4,
      reset: 123456789,
    });
  });

  it("throws 429 error when blocked", async () => {
    await expect(
      enforceLLMRateLimitWithLimitFn(
        {
          userId: "user-1",
          projectId: "project-1",
          provider: "openai",
          enabled: true,
        },
        async () => ({
          success: false,
          limit: 5,
          remaining: 0,
          reset: Date.now() + 60_000,
        }),
      ),
    ).rejects.toBeInstanceOf(LLMRateLimitError);
  });

  it("creates rate limit headers", () => {
    const info: LLMRateLimitInfo = {
      identifier: "llm:user:user-1:project:project-1",
      limit: 5,
      remaining: 3,
      reset: 123456789,
    };

    expect(createRateLimitHeaders(info)).toEqual({
      "X-RateLimit-Limit": "5",
      "X-RateLimit-Remaining": "3",
      "X-RateLimit-Reset": "123456789",
    });
  });

  it("creates rate limit error headers", () => {
    const error = new LLMRateLimitError({
      identifier: "llm:user:user-1:project:project-1",
      limit: 5,
      remaining: 0,
      reset: 123456789,
      retryAfterSeconds: 30,
    });

    expect(createRateLimitErrorHeaders(error)).toEqual({
      "Retry-After": "30",
      "X-RateLimit-Limit": "5",
      "X-RateLimit-Remaining": "0",
      "X-RateLimit-Reset": "123456789",
    });
  });
});
