import { NextResponse } from "next/server";
import { z } from "zod";

import { llmErrorToResponse } from "@/server/llm";
import { logRuntimeError } from "@/server/observability/logger";
import { OrchestratorInvalidOutputError, replanProject } from "@/server/orchestrator";
import { assertProjectOwnership } from "@/server/projects/assert-project-ownership";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const replanRequestSchema = z
  .object({
    recentEventLimit: z.number().int().min(1).max(100).optional(),
    activeTicketLimit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const ownershipCheck = await assertProjectOwnership(projectId);

  if (!ownershipCheck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown = {};
  try {
    const rawBody = await request.text();
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validatedPayload = replanRequestSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid replan payload" }, { status: 400 });
  }

  try {
    const result = await replanProject({
      projectId: ownershipCheck.project.id,
      userId: ownershipCheck.currentUser.id,
      contextOptions: validatedPayload.data,
    });

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const runId =
      error &&
      typeof error === "object" &&
      "runId" in error &&
      typeof (error as { runId?: unknown }).runId === "string"
        ? ((error as { runId: string }).runId as string)
        : undefined;

    if (error instanceof OrchestratorInvalidOutputError) {
      return NextResponse.json(
        {
          error: "Invalid orchestrator output",
          ...(runId ? { runId } : {}),
        },
        { status: 502 },
      );
    }

    const llmResponse = llmErrorToResponse(error, {
      route: "POST /api/projects/[projectId]/orchestrator/replan",
      operation: "orchestrator.replan",
      runId,
      userId: ownershipCheck.currentUser.id,
      projectId: ownershipCheck.project.id,
    });
    if (llmResponse) {
      return llmResponse;
    }

    logRuntimeError({
      event: "run_failed",
      message: "Replan route failed with unhandled error",
      context: {
        route: "POST /api/projects/[projectId]/orchestrator/replan",
        operation: "orchestrator.replan",
        projectId: ownershipCheck.project.id,
        userId: ownershipCheck.currentUser.id,
        runId,
        statusCode: 500,
      },
      error,
    });

    return NextResponse.json(
      {
        error: "Replan failed",
        ...(runId ? { runId } : {}),
      },
      { status: 500 },
    );
  }
}
