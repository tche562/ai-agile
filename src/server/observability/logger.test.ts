import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logRuntimeError, normalizeErrorForLog, redactLogContext } from "./logger";

describe("observability/logger", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("normalizes unknown errors safely", () => {
    const normalized = normalizeErrorForLog("plain failure");
    expect(normalized).toEqual({
      errorName: "UnknownError",
      errorMessage: "plain failure",
    });
  });

  it("redacts sensitive context fields", () => {
    const redacted = redactLogContext({
      runId: "run-1",
      apiKey: "secret-key",
      nested: {
        authorization: "Bearer token",
      },
      safeField: "ok",
    });

    expect(redacted.runId).toBe("run-1");
    expect(redacted.safeField).toBe("ok");
    expect(redacted.apiKey).toBe("[REDACTED]");
    expect((redacted.nested as Record<string, unknown>).authorization).toBe("[REDACTED]");
  });

  it("emits structured runtime error log with event and runId", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logRuntimeError({
      event: "run_failed",
      message: "Run failed",
      context: {
        runId: "run-123",
        projectId: "project-1",
      },
      error: new Error("Boom"),
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const logged = errorSpy.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(logged.event).toBe("run_failed");
    expect(logged.runId).toBe("run-123");
    expect(logged.projectId).toBe("project-1");
    expect(logged.errorName).toBe("Error");
  });
});
