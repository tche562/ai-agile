import "dotenv/config";
import { z } from "zod";
import { createLLMClient } from "../src/server/llm/factory";

const demoSchema = z.object({
  summary: z.string(),
  priority: z.enum(["P0", "P1", "P2"]),
  risks: z.array(z.string()),
});

type Provider = "openai" | "anthropic";

async function verifyProvider(provider: Provider) {
  const client = createLLMClient(provider);

  const result = await client.generateJSON({
    system: "You are a project planning assistant for an AI Agile project manager.",
    user: "Return a very short ticket summary for building login, set priority, and list 2 risks.",
    schema: demoSchema,
  });

  console.log(`\n${provider.toUpperCase()} OK`);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (!hasOpenAI && !hasAnthropic) {
    throw new Error(
      "No API keys found. Please set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in .env"
    );
  }

  if (hasOpenAI) {
    await verifyProvider("openai");
  } else {
    console.log("Skipping OpenAI: OPENAI_API_KEY is not set.");
  }

  if (hasAnthropic) {
    await verifyProvider("anthropic");
  } else {
    console.log("Skipping Anthropic: ANTHROPIC_API_KEY is not set.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});