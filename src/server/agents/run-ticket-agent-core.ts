import { RunStatus, RunType } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "../db";
import { createLLMClient, type LLMClient, type LLMProvider } from "../llm";
import { toTicketExecutionDTO, type TicketExecutionContextDTO } from "../tickets/execution-context";
import {
  agentOutputSchema,
  parseAgentOutput,
  type AgentOutput,
  type AgentRoleValue,
} from "./schemas";
import { AgentRunInvalidOutputError, AgentRunTicketNotFoundError } from "./errors";

type RunTicketAgentCoreInput = {
  ticketId: string;
  userId: string;
  role: AgentRoleValue;
  instruction?: string;
  llmClient?: LLMClient;
};

type RunSummary = {
  id: string;
  type: RunType;
  status: RunStatus;
  projectId: string;
  ticketId: string | null;
  agentId: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

type ProjectContext = {
  id: string;
  name: string;
  description: string | null;
};

export type RunTicketAgentCoreResult = {
  run: RunSummary;
  ticket: TicketExecutionContextDTO;
  agentOutput: AgentOutput;
};

function resolveLLMProvider(): LLMProvider {
  const provider = process.env.AGENT_RUN_LLM_PROVIDER ?? process.env.LLM_PROVIDER ?? "openai";

  if (provider === "openai" || provider === "anthropic" || provider === "deepseek") {
    return provider;
  }

  if (provider === "test" && process.env.E2E_TEST_MODE === "true") {
    return provider;
  }

  throw new Error(`Unsupported agent LLM provider: ${provider}`);
}

function buildAgentRunSystemPrompt(role: AgentRoleValue): string {
  return [
    `You are the ${role} agent for one ticket execution run.`,
    "Return JSON only. Do not output markdown, code fences, or commentary outside JSON.",
    "The JSON must match the provided schema exactly.",
    `The role field must be exactly "${role}".`,
    "This output is advisory worklog data. Do not claim that you directly modified database state.",
    "Use only status values COMPLETED, NEEDS_FOLLOWUP, or BLOCKED.",
  ].join("\n");
}

function buildAgentRunUserPrompt(input: {
  role: AgentRoleValue;
  instruction?: string;
  project: ProjectContext;
  ticket: TicketExecutionContextDTO;
}): string {
  return JSON.stringify(
    {
      task: "Execute one focused ticket analysis and return a structured agent worklog.",
      role: input.role,
      instruction: input.instruction ?? null,
      project: input.project,
      ticket: input.ticket,
      constraints: {
        advisoryOnly: true,
        noDirectTicketMutation: true,
        roleMustMatchRequestedRole: true,
      },
    },
    null,
    2,
  );
}

function toSafeAgentRunError(error: unknown): unknown {
  if (error instanceof AgentRunInvalidOutputError) {
    return error;
  }

  if (error instanceof ZodError) {
    return new AgentRunInvalidOutputError();
  }

  return error;
}

async function markRunStatus(runId: string, status: RunStatus): Promise<RunSummary> {
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
    select: {
      id: true,
      type: true,
      status: true,
      projectId: true,
      ticketId: true,
      agentId: true,
      startedAt: true,
      finishedAt: true,
    },
  });
}

async function getOwnedTicketExecutionContext(input: {
  ticketId: string;
  userId: string;
}): Promise<{ project: ProjectContext; ticket: TicketExecutionContextDTO }> {
  const ownedTicket = await db.ticket.findFirst({
    where: {
      id: input.ticketId,
      project: {
        ownerId: input.userId,
      },
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
      currentVersion: true,
    },
  });

  if (!ownedTicket) {
    throw new AgentRunTicketNotFoundError();
  }

  return {
    project: {
      id: ownedTicket.project.id,
      name: ownedTicket.project.name,
      description: ownedTicket.project.description,
    },
    ticket: toTicketExecutionDTO(ownedTicket),
  };
}

function parseAndAssertAgentOutput(rawOutput: unknown, expectedRole: AgentRoleValue): AgentOutput {
  const parsed = parseAgentOutput(rawOutput);

  if (parsed.role !== expectedRole) {
    throw new AgentRunInvalidOutputError();
  }

  return parsed;
}

export async function runTicketAgentCore(
  input: RunTicketAgentCoreInput,
): Promise<RunTicketAgentCoreResult> {
  const context = await getOwnedTicketExecutionContext({
    ticketId: input.ticketId,
    userId: input.userId,
  });

  const agent = await db.agent.findFirst({
    where: {
      role: input.role,
    },
    select: {
      id: true,
    },
  });

  const run = await db.run.create({
    data: {
      type: RunType.EXECUTION,
      status: RunStatus.RUNNING,
      projectId: context.project.id,
      ticketId: context.ticket.id,
      agentId: agent?.id ?? null,
    },
    select: {
      id: true,
      type: true,
      status: true,
      projectId: true,
      ticketId: true,
      agentId: true,
      startedAt: true,
      finishedAt: true,
    },
  });

  try {
    const llmClient = input.llmClient ?? createLLMClient(resolveLLMProvider());
    const llmResult = await llmClient.generateJSON({
      system: buildAgentRunSystemPrompt(input.role),
      user: buildAgentRunUserPrompt({
        role: input.role,
        instruction: input.instruction,
        project: context.project,
        ticket: context.ticket,
      }),
      schema: agentOutputSchema,
      meta: {
        userId: input.userId,
        projectId: context.project.id,
        runId: run.id,
        purpose: "agent.run-ticket",
        temperature: 0,
      },
    });

    const agentOutput = parseAndAssertAgentOutput(llmResult.object, input.role);
    const succeededRun = await markRunStatus(run.id, RunStatus.SUCCEEDED);

    return {
      run: succeededRun,
      ticket: context.ticket,
      agentOutput,
    };
  } catch (error) {
    const safeError = toSafeAgentRunError(error);

    try {
      await markRunStatus(run.id, RunStatus.FAILED);
    } catch {
      // Preserve the original business error even if run finalization fails.
    }

    throw safeError;
  }
}
