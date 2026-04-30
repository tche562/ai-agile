import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseAndValidateJson } from "./utils";

describe("parseAndValidateJson", () => {
  it("parses valid plain JSON", () => {
    const schema = z.object({
      title: z.string(),
      done: z.boolean(),
    });

    const result = parseAndValidateJson({
      rawText: JSON.stringify({ title: "Test", done: false }),
      schema,
      provider: "openai",
      model: "test-model",
    });

    expect(result).toEqual({ title: "Test", done: false });
  });

  it("parses JSON inside markdown code fences", () => {
    const schema = z.object({
      value: z.number(),
    });

    const result = parseAndValidateJson({
      rawText: '```json\n{"value":123}\n```',
      schema,
      provider: "anthropic",
      model: "test-model",
    });

    expect(result).toEqual({ value: 123 });
  });

  it("throws when JSON does not match schema", () => {
    const schema = z.object({
      priority: z.enum(["P0", "P1"]),
    });

    expect(() =>
      parseAndValidateJson({
        rawText: JSON.stringify({ priority: "P9" }),
        schema,
        provider: "openai",
        model: "test-model",
      }),
    ).toThrowError();
  });

  it("throws when raw text is not JSON", () => {
    const schema = z.object({
      title: z.string(),
    });

    expect(() =>
      parseAndValidateJson({
        rawText: "This is not JSON.",
        schema,
        provider: "openai",
        model: "test-model",
      }),
    ).toThrowError();
  });
});
