import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { mockEnforceRateLimit, mockAssertDailyLLMQuota, mockRecordLLMUsage } = vi.hoisted(() => ({
  mockEnforceRateLimit: vi.fn(),
  mockAssertDailyLLMQuota: vi.fn(),
  mockRecordLLMUsage: vi.fn(),
}));

const { mockLogRuntimeWarning } = vi.hoisted(() => ({
  mockLogRuntimeWarning: vi.fn(),
}));

vi.mock("./ratelimit", () => ({
  enforceLLMRateLimit: mockEnforceRateLimit,
}));

vi.mock("./usage", () => ({
  assertDailyLLMQuota: mockAssertDailyLLMQuota,
  recordLLMUsage: mockRecordLLMUsage,
}));

vi.mock("../observability/logger", () => ({
  logRuntimeWarning: mockLogRuntimeWarning,
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

  it("logs parse failure context without raw output", async () => {
    const adapter: LLMProviderAdapter = {
      provider: "openai",
      defaultModel: "gpt-4o",
      generateRawText: vi
        .fn()
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          rawText: JSON.stringify({ wrong: true }),
          inputTokens: 10,
          outputTokens: 10,
        })
        .mockResolvedValueOnce({
          provider: "openai",
          model: "gpt-4o",
          rawText: JSON.stringify({ ok: true }),
          inputTokens: 10,
          outputTokens: 10,
        }),
    };
    const client = new GatewayLLMClient(adapter);

    await client.generateJSON({
      system: "Return JSON",
      user: "test",
      schema: z.object({ ok: z.boolean() }),
      meta: {
        userId: "user-1",
        projectId: "project-1",
        runId: "run-1",
        maxRetries: 1,
      },
    });

    expect(mockLogRuntimeWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "llm_parse_failed",
        context: expect.objectContaining({
          runId: "run-1",
          projectId: "project-1",
          userId: "user-1",
          parseFailureType: "schema_validation",
        }),
      }),
    );
    const logArgs = mockLogRuntimeWarning.mock.calls[0]?.[0] as {
      context: Record<string, unknown>;
    };
    expect(logArgs.context.rawText).toBeUndefined();
    expect(logArgs.context.systemPrompt).toBeUndefined();
    expect(logArgs.context.userPrompt).toBeUndefined();
  });

  it("records usage once on successful generation", async () => {
    const adapter: LLMProviderAdapter = {
      provider: "test",
      defaultModel: "gpt-4o",
      generateRawText: vi.fn().mockResolvedValue({
        provider: "test",
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
        provider: "test",
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
