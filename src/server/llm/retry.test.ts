import { describe, expect, it } from "vitest";
import { z } from "zod";
import { generateJSONWithRetry, resolveMaxRetries } from "./retry";
import { LLMGenerationFailedError } from "./types";

describe("generateJSONWithRetry", () => {
  it("returns on the first attempt when output is valid", async () => {
    const schema = z.object({
      title: z.string(),
    });

    let calls = 0;

    const result = await generateJSONWithRetry({
      provider: "openai",
      model: "test-model",
      schema,
      generateRawText: async () => {
        calls += 1;
        return {
          rawText: JSON.stringify({ title: "Valid output" }),
        };
      },
    });

    expect(calls).toBe(1);
    expect(result.object).toEqual({ title: "Valid output" });
    expect(result.attempts).toBe(1);
    expect(result.retryCount).toBe(0);
  });

  it("retries after invalid JSON and then succeeds", async () => {
    const schema = z.object({
      title: z.string(),
    });

    let calls = 0;

    const result = await generateJSONWithRetry({
      provider: "openai",
      model: "test-model",
      schema,
      maxRetries: 2,
      generateRawText: async () => {
        calls += 1;

        if (calls === 1) {
          return {
            rawText: "This is not JSON.",
          };
        }

        return {
          rawText: JSON.stringify({ title: "Recovered output" }),
        };
      },
    });

    expect(calls).toBe(2);
    expect(result.object).toEqual({ title: "Recovered output" });
    expect(result.attempts).toBe(2);
    expect(result.retryCount).toBe(1);
  });

  it("retries after schema validation failure and then succeeds", async () => {
    const schema = z.object({
      priority: z.enum(["P0", "P1", "P2"]),
    });

    let calls = 0;

    const result = await generateJSONWithRetry({
      provider: "openai",
      model: "test-model",
      schema,
      maxRetries: 2,
      generateRawText: async () => {
        calls += 1;

        if (calls === 1) {
          return {
            rawText: JSON.stringify({ priority: "URGENT" }),
          };
        }

        return {
          rawText: JSON.stringify({ priority: "P1" }),
        };
      },
    });

    expect(calls).toBe(2);
    expect(result.object).toEqual({ priority: "P1" });
    expect(result.retryCount).toBe(1);
  });

  it("throws a structured error after retry budget is exhausted", async () => {
    const schema = z.object({
      title: z.string(),
    });

    let calls = 0;

    await expect(
      generateJSONWithRetry({
        provider: "openai",
        model: "test-model",
        schema,
        maxRetries: 1,
        generateRawText: async () => {
          calls += 1;
          return {
            rawText: "Still not JSON.",
          };
        },
      }),
    ).rejects.toBeInstanceOf(LLMGenerationFailedError);

    expect(calls).toBe(2);
  });

  it("caps maxRetries at the MVP hard limit", () => {
    expect(resolveMaxRetries(999)).toBe(2);
  });

  it("normalizes invalid maxRetries to the default", () => {
    expect(resolveMaxRetries(Number.NaN)).toBe(2);
  });

  it("allows disabling retry with maxRetries 0", () => {
    expect(resolveMaxRetries(0)).toBe(0);
  });
});
