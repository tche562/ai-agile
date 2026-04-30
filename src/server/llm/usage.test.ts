import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockUsageAggregate, mockUsageCreate } = vi.hoisted(() => ({
  mockUsageAggregate: vi.fn(),
  mockUsageCreate: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    usage: {
      aggregate: mockUsageAggregate,
      create: mockUsageCreate,
    },
  },
}));

import { DailyQuotaExceededError } from "./errors";
import { assertDailyLLMQuota, getUtcDayRange, recordLLMUsage } from "./usage";

describe("LLM usage helpers", () => {
  const originalEnv = {
    LLM_DAILY_TOKEN_LIMIT_PER_USER: process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER,
    LLM_DAILY_TOKEN_LIMIT_PER_PROJECT: process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT,
    LLM_DAILY_COST_LIMIT_USD_PER_USER: process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER,
    LLM_DAILY_COST_LIMIT_USD_PER_PROJECT: process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER = originalEnv.LLM_DAILY_TOKEN_LIMIT_PER_USER;
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT = originalEnv.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT;
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER = originalEnv.LLM_DAILY_COST_LIMIT_USD_PER_USER;
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT =
      originalEnv.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT;
  });

  it("builds UTC day range boundaries", () => {
    const { start, end } = getUtcDayRange(new Date("2026-04-26T15:24:30.000Z"));

    expect(start.toISOString()).toBe("2026-04-26T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-04-27T00:00:00.000Z");
  });

  it("throws DailyQuotaExceededError when user token usage exceeds limit", async () => {
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER = "100";
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT = "1000";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER = "10";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT = "10";

    mockUsageAggregate
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 100,
          costUsd: 0.5,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 50,
          costUsd: 0.2,
        },
      });

    await expect(
      assertDailyLLMQuota({
        userId: "user-1",
        projectId: "project-1",
      }),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });

  it("throws DailyQuotaExceededError when project token usage exceeds limit", async () => {
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER = "1000";
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT = "100";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER = "10";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT = "10";

    // User has low personal usage, but project is at quota from another user.
    mockUsageAggregate
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 1,
          costUsd: 0.1,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 100,
          costUsd: 0.4,
        },
      });

    await expect(
      assertDailyLLMQuota({
        userId: "current-user",
        projectId: "project-token-overflow",
      }),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });

  it("throws DailyQuotaExceededError when user cost usage exceeds limit", async () => {
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER = "1000";
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT = "1000";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER = "1";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT = "10";

    mockUsageAggregate
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 20,
          costUsd: 1,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 20,
          costUsd: 0.2,
        },
      });

    await expect(
      assertDailyLLMQuota({
        userId: "user-1",
        projectId: "project-1",
      }),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });

  it("throws DailyQuotaExceededError when project cost usage exceeds limit", async () => {
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER = "1000";
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT = "1000";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER = "10";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT = "1";

    mockUsageAggregate
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 20,
          costUsd: 0.2,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 20,
          costUsd: 1,
        },
      });

    await expect(
      assertDailyLLMQuota({
        userId: "user-1",
        projectId: "project-1",
      }),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });

  it("uses safe defaults when env values are invalid", async () => {
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_USER = "abc";
    process.env.LLM_DAILY_TOKEN_LIMIT_PER_PROJECT = "-1";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_USER = "-1";
    process.env.LLM_DAILY_COST_LIMIT_USD_PER_PROJECT = "xyz";

    mockUsageAggregate
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 50_000,
          costUsd: 1,
        },
      })
      .mockResolvedValueOnce({
        _sum: {
          totalTokens: 10,
          costUsd: 0.1,
        },
      });

    await expect(
      assertDailyLLMQuota({
        userId: "user-1",
        projectId: "project-1",
      }),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });

  it("recordLLMUsage persists audit fields and usage totals", async () => {
    mockUsageCreate.mockResolvedValue({
      id: "usage-1",
      runId: "run-1",
      userId: "user-1",
      projectId: "project-1",
      provider: "openai",
      model: "gpt-4o",
      promptTokens: 120,
      completionTokens: 80,
      totalTokens: 200,
      costUsd: 0.0018,
    });

    const created = await recordLLMUsage({
      runId: "run-1",
      userId: "user-1",
      projectId: "project-1",
      provider: "openai",
      model: "gpt-4o",
      inputTokens: 120,
      outputTokens: 80,
    });

    expect(mockUsageCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          runId: "run-1",
          userId: "user-1",
          projectId: "project-1",
          provider: "openai",
          model: "gpt-4o",
          promptTokens: 120,
          completionTokens: 80,
          totalTokens: 200,
        }),
      }),
    );
    expect(created.id).toBe("usage-1");
  });
});
