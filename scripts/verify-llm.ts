import "dotenv/config";
import { RunType } from "@prisma/client";
import { z } from "zod";
import { createLLMClient } from "../src/server/llm/factory";
import { db } from "../src/server/db";

const demoSchema = z.object({
  summary: z.string(),
  priority: z.enum(["P0", "P1", "P2"]),
  risks: z.array(z.string()),
});

type Provider = "openai" | "anthropic";

async function ensureVerifyContext() {
  const user = await db.user.upsert({
    where: {
      email: "verify.llm@ai-agile.local",
    },
    update: {
      name: "LLM Verify User",
    },
    create: {
      email: "verify.llm@ai-agile.local",
      name: "LLM Verify User",
    },
  });

  let project = await db.project.findFirst({
    where: {
      ownerId: user.id,
      name: "LLM Verify Project",
    },
  });

  if (!project) {
    project = await db.project.create({
      data: {
        ownerId: user.id,
        name: "LLM Verify Project",
        description: "Project used by scripts/verify-llm.ts",
      },
    });
  }

  const run = await db.run.create({
    data: {
      projectId: project.id,
      type: RunType.EXECUTION,
    },
  });

  return { user, project, run };
}

async function verifyProvider(provider: Provider) {
  const client = createLLMClient(provider);
  const context = await ensureVerifyContext();

  const result = await client.generateJSON({
    system: "You are a project planning assistant for an AI Agile project manager.",
    user: "Return a very short ticket summary for building login, set priority, and list 2 risks.",
    schema: demoSchema,
    meta: {
      userId: context.user.id,
      projectId: context.project.id,
      runId: context.run.id,
    },
  });

  console.log(`\n${provider.toUpperCase()} OK`);
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

  if (!hasOpenAI && !hasAnthropic) {
    throw new Error(
      "No API keys found. Please set OPENAI_API_KEY and/or ANTHROPIC_API_KEY in .env",
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

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
