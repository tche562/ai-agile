import { EventType } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

import { authOptions } from "@/auth";
import { db } from "@/server/db";
import { AgentRunInvalidOutputError, AgentRunTicketNotFoundError } from "@/server/agents/errors";
import { runTicketAgentCore } from "@/server/agents/run-ticket-agent-core";
import { createValidatedEvent } from "@/server/events/service";
import { llmErrorToResponse } from "@/server/llm";
import { agentRoleSchema, type AgentOutput } from "../../../../../server/agents/schemas";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

const agentRunRequestSchema = z
  .object({
    role: agentRoleSchema,
    instruction: z.string().trim().min(1).optional(),
  })
  .strict();

function buildRoleSpecificOutput(agentOutput: AgentOutput): Record<string, unknown> {
  switch (agentOutput.role) {
    case "PLANNER":
      return {
        planningNotes: agentOutput.planningNotes,
        dependencyNotes: agentOutput.dependencyNotes,
        scopeConcerns: agentOutput.scopeConcerns,
        acceptanceCriteriaSuggestions: agentOutput.acceptanceCriteriaSuggestions,
      };
    case "IMPLEMENTER":
      return {
        implementationPlan: agentOutput.implementationPlan,
        touchedAreas: agentOutput.touchedAreas,
        technicalRisks: agentOutput.technicalRisks,
        testSuggestions: agentOutput.testSuggestions,
      };
    case "QA":
      return {
        testPlan: agentOutput.testPlan,
        edgeCases: agentOutput.edgeCases,
        regressionRisks: agentOutput.regressionRisks,
        acceptanceCheckResults: agentOutput.acceptanceCheckResults,
      };
    default: {
      const exhaustive: never = agentOutput;
      throw new Error(`Unsupported agent output role: ${String(exhaustive)}`);
    }
  }
}

function buildWorklogPayload(input: { runId: string; ticketId: string; agentOutput: AgentOutput }) {
  return {
    schemaVersion: input.agentOutput.schemaVersion,
    runId: input.runId,
    ticketId: input.ticketId,
    agentRole: input.agentOutput.role,
    summary: input.agentOutput.summary,
    status: input.agentOutput.status,
    findings: input.agentOutput.findings,
    risks: input.agentOutput.risks,
    suggestedNextSteps: input.agentOutput.suggestedNextSteps,
    replanSignal: input.agentOutput.replanSignal,
    roleSpecificOutput: buildRoleSpecificOutput(input.agentOutput),
  } as const;
}

async function getApiAuthUserOrNull() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return null;
  }

  return db.user.upsert({
    where: {
      email: session.user.email,
    },
    create: {
      email: session.user.email,
      name: session.user.name ?? null,
    },
    update: {
      name: session.user.name ?? null,
    },
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const currentUser = await getApiAuthUserOrNull();

  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { ticketId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validatedPayload = agentRunRequestSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid agent run payload" }, { status: 400 });
  }

  try {
    const runResult = await runTicketAgentCore({
      ticketId,
      userId: currentUser.id,
      role: validatedPayload.data.role,
      instruction: validatedPayload.data.instruction,
    });

    const worklogPayload = buildWorklogPayload({
      runId: runResult.run.id,
      ticketId: runResult.ticket.id,
      agentOutput: runResult.agentOutput,
    });

    const event = await createValidatedEvent(db, {
      type: EventType.WORKLOG_ADDED,
      projectId: runResult.ticket.projectId,
      ticketId: runResult.ticket.id,
      payload: worklogPayload,
    });

    return NextResponse.json({
      run: runResult.run,
      worklog: worklogPayload,
      event: {
        id: event.id,
        type: event.type,
        projectId: event.projectId,
        ticketId: event.ticketId,
        createdAt: event.createdAt.toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof AgentRunTicketNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (error instanceof AgentRunInvalidOutputError) {
      return NextResponse.json({ error: "Invalid agent output" }, { status: 502 });
    }

    const llmResponse = llmErrorToResponse(error);
    if (llmResponse) {
      return llmResponse;
    }

    return NextResponse.json({ error: "Agent run failed" }, { status: 500 });
  }
}
