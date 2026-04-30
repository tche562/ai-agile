import { RunStatus, RunType } from "@prisma/client";

import { createLLMClient, type LLMClient, type LLMProvider } from "../llm";
import { db } from "../db";
import { applyOrchestratorPlan } from "./apply-engine";
import {
  buildGeneratePlanContext,
  buildReplanContext,
  type BuildReplanContextOptions,
} from "./context";
import {
  buildGeneratePlanSystemPrompt,
  buildGeneratePlanUserPrompt,
  buildReplanSystemPrompt,
  buildReplanUserPrompt,
} from "./prompts";
import { orchestratorOutputSchema, type OrchestratorOutput, type TicketHarness } from "./schemas";

const MIN_GENERATED_TICKETS = 8;
const MAX_GENERATED_TICKETS = 20;

export class GeneratePlanAlreadyExistsError extends Error {
  constructor() {
    super("Generate Plan can only run for projects without existing tickets.");
    this.name = "GeneratePlanAlreadyExistsError";
  }
}

export class OrchestratorInvalidOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrchestratorInvalidOutputError";
  }
}

type GeneratePlanServiceInput = {
  projectId: string;
  userId: string;
  llmClient?: LLMClient;
};

type ReplanProjectServiceInput = {
  projectId: string;
  userId: string;
  llmClient?: LLMClient;
  contextOptions?: BuildReplanContextOptions;
};

function resolveLLMProvider(): LLMProvider {
  const provider = process.env.ORCHESTRATOR_LLM_PROVIDER ?? process.env.LLM_PROVIDER ?? "openai";

  if (provider === "openai" || provider === "anthropic") {
    return provider;
  }

  throw new Error(`Unsupported orchestrator LLM provider: ${provider}`);
}

function assertHarnessComplete(harness: TicketHarness, ticketTitle: string) {
  const entries = Object.entries(harness);
  const missingField = entries.find(([, value]) => value.length === 0);

  if (missingField) {
    throw new OrchestratorInvalidOutputError(
      `Generated ticket "${ticketTitle}" has an incomplete harness field: ${missingField[0]}.`,
    );
  }
}

function assertGeneratePlanOutput(output: OrchestratorOutput) {
  if (
    output.createTickets.length < MIN_GENERATED_TICKETS ||
    output.createTickets.length > MAX_GENERATED_TICKETS
  ) {
    throw new OrchestratorInvalidOutputError("Generate Plan must create between 8 and 20 tickets.");
  }

  if (output.updateTickets.length > 0 || output.closeTickets.length > 0) {
    throw new OrchestratorInvalidOutputError(
      "Generate Plan must not include updateTickets or closeTickets.",
    );
  }

  for (const ticket of output.createTickets) {
    assertHarnessComplete(ticket.harness, ticket.title);
  }
}

async function markRun(runId: string, status: RunStatus) {
  return db.run.update({
    where: {
      id: runId,
    },
    data: {
      status,
      finishedAt:
        status === RunStatus.SUCCEEDED ||
        status === RunStatus.FAILED ||
        status === RunStatus.CANCELED
          ? new Date()
          : null,
    },
  });
}

export async function generatePlan(input: GeneratePlanServiceInput) {
  const context = await buildGeneratePlanContext(input.projectId, input.userId);

  if (!context) {
    return null;
  }

  if (context.existingTicketCount > 0) {
    throw new GeneratePlanAlreadyExistsError();
  }

  const run = await db.run.create({
    data: {
      projectId: input.projectId,
      type: RunType.PLANNING,
    },
  });

  try {
    await markRun(run.id, RunStatus.RUNNING);

    const llmClient = input.llmClient ?? createLLMClient(resolveLLMProvider());
    const result = await llmClient.generateJSON({
      system: buildGeneratePlanSystemPrompt(),
      user: buildGeneratePlanUserPrompt(context.input),
      schema: orchestratorOutputSchema,
      meta: {
        userId: input.userId,
        projectId: input.projectId,
        runId: run.id,
        purpose: "orchestrator.generate-plan",
        temperature: 0,
      },
    });

    const plan = orchestratorOutputSchema.parse(result.object);
    assertGeneratePlanOutput(plan);

    const applied = await applyOrchestratorPlan({
      projectId: input.projectId,
      userId: input.userId,
      runId: run.id,
      plan,
    });

    await markRun(run.id, RunStatus.SUCCEEDED);

    return {
      runId: run.id,
      ...applied,
    };
  } catch (error) {
    await markRun(run.id, RunStatus.FAILED);
    throw error;
  }
}

export async function replanProject(input: ReplanProjectServiceInput) {
  const context = await buildReplanContext(input.projectId, input.userId, input.contextOptions);

  if (!context) {
    return null;
  }

  const run = await db.run.create({
    data: {
      projectId: input.projectId,
      type: RunType.REPLAN,
    },
  });

  try {
    await markRun(run.id, RunStatus.RUNNING);

    const llmClient = input.llmClient ?? createLLMClient(resolveLLMProvider());
    const result = await llmClient.generateJSON({
      system: buildReplanSystemPrompt(),
      user: buildReplanUserPrompt(context),
      schema: orchestratorOutputSchema,
      meta: {
        userId: input.userId,
        projectId: input.projectId,
        runId: run.id,
        purpose: "orchestrator.replan",
        temperature: 0,
      },
    });

    const plan = orchestratorOutputSchema.parse(result.object);

    for (const ticket of plan.createTickets) {
      assertHarnessComplete(ticket.harness, ticket.title);
    }
    for (const ticket of plan.updateTickets) {
      if (ticket.harness) {
        assertHarnessComplete(ticket.harness, ticket.ticketId);
      }
    }

    const applied = await applyOrchestratorPlan({
      projectId: input.projectId,
      userId: input.userId,
      runId: run.id,
      plan,
    });

    await markRun(run.id, RunStatus.SUCCEEDED);

    return {
      runId: run.id,
      ...applied,
    };
  } catch (error) {
    await markRun(run.id, RunStatus.FAILED);
    throw error;
  }
}
