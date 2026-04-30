import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockEnforceRateLimit, mockAssertDailyLLMQuota, mockRecordLLMUsage } = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn(),
  mockAssertDailyLLMQuota: vi.fn(),
  mockRecordLLMUsage: vi.fn(),
}));

vi.mock("./ratelimit", () => ({
  enforceLLMRateLimit: mockEnforceRateLimit,
}));

vi.mock("./usage", () => ({
  assertDailyLLMQuota: mockAssertDailyLLMQuota,
  recordLLMUsage: mockRecordLLMUsage,
}));

import { GatewayLLMClient, type LLMProviderAdapter } from "./client";
import { DailyQuotaExceededError } from "./errors";

describe("GatewayLLMClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnforceRateLimit.mockResolvedValue(undefined);
    mockAssertDailyLLMQuota.mockResolvedValue(undefined);
    mockRecordLLMUsage.mockResolvedValue({ id: "usage-1" });
  });

  it("records usage once on successful generation", async () => {
    const adapter: LLMProviderAdapter = {
      provider: "openai",
      defaultModel: "gpt-4o",
      generateRawText: vi.fn().mockResolvedValue({
        provider: "openai",
        model: "gpt-4o",
        rawText: JSON.stringify({ ok: true }),
        inputTokens: 120,
        outputTokens: 30,
      }),
    };
    const client = new GatewayLLMClient(adapter);

    const result = await client.generateJSON({
      system: "Return JSON",
      user: "test",
      schema: z.object({ ok: z.boolean() }),
      meta: {
        userId: "user-1",
        projectId: "project-1",
        runId: "run-1",
      },
    });

    expect(result.object).toEqual({ ok: true });
    expect(mockRecordLLMUsage).toHaveBeenCalledTimes(1);
    expect(mockRecordLLMUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        model: "gpt-4o",
      }),
    );
  });

  it("records usage for each attempt when first response fails parsing", async () => {
    const adapter: LLMProviderAdapter = {
      provider: "anthropic",
      defaultModel: "claude-sonnet-4-5",
      generateRawText: vi
        .fn()
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          rawText: "not-json",
          inputTokens: 50,
          outputTokens: 20,
        })
        .mockResolvedValueOnce({
          provider: "anthropic",
          model: "claude-sonnet-4-5",
          rawText: JSON.stringify({ title: "ok" }),
          inputTokens: 60,
          outputTokens: 30,
        }),
    };
    const client = new GatewayLLMClient(adapter);

    const result = await client.generateJSON({
      system: "Return JSON",
      user: "retry",
      schema: z.object({ title: z.string() }),
      meta: {
        userId: "user-1",
        projectId: "project-1",
        runId: "run-1",
        maxRetries: 1,
      },
    });

    expect(result.object).toEqual({ title: "ok" });
    expect(mockRecordLLMUsage).toHaveBeenCalledTimes(2);
  });

  it("does not call provider when quota check fails", async () => {
    const adapter: LLMProviderAdapter = {
      provider: "openai",
      defaultModel: "gpt-4o",
      generateRawText: vi.fn(),
    };
    mockAssertDailyLLMQuota.mockRejectedValue(
      new DailyQuotaExceededError({
        userId: "user-1",
        projectId: "project-1",
        reason: "User daily token quota exceeded",
      }),
    );

    const client = new GatewayLLMClient(adapter);

    await expect(
      client.generateJSON({
        system: "Return JSON",
        user: "quota",
        schema: z.object({ ok: z.boolean() }),
        meta: {
          userId: "user-1",
          projectId: "project-1",
          runId: "run-1",
        },
      }),
    ).rejects.toBeInstanceOf(DailyQuotaExceededError);

    expect(adapter.generateRawText).not.toHaveBeenCalled();
  });
});
