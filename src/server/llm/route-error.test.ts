import { describe, expect, it } from "vitest";

import { DailyQuotaExceededError } from "./errors";
import { llmErrorToResponse } from "./route-error";

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
  });

  it("returns null for unrelated errors", () => {
    expect(llmErrorToResponse(new Error("other"))).toBeNull();
  });
});
