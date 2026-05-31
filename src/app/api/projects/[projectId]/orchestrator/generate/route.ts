import { NextResponse } from "next/server";

import { llmErrorToResponse } from "@/server/llm";
import {
  generatePlan,
  GeneratePlanAlreadyExistsError,
  OrchestratorInvalidOutputError,
} from "@/server/orchestrator";
import { logRuntimeError } from "@/server/observability/logger";
import { assertProjectOwnership } from "@/server/projects/assert-project-ownership";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function POST(_: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const ownershipCheck = await assertProjectOwnership(projectId);

  if (!ownershipCheck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await generatePlan({
      projectId: ownershipCheck.project.id,
      userId: ownershipCheck.currentUser.id,
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

    if (error instanceof GeneratePlanAlreadyExistsError) {
      return NextResponse.json(
        { error: "Generate Plan can only run for projects without existing tickets" },
        { status: 409 },
      );
    }

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
      route: "POST /api/projects/[projectId]/orchestrator/generate",
      operation: "orchestrator.generate_plan",
      runId,
      userId: ownershipCheck.currentUser.id,
      projectId: ownershipCheck.project.id,
    });
    if (llmResponse) {
      return llmResponse;
    }

    logRuntimeError({
      event: "run_failed",
      message: "Generate Plan route failed with unhandled error",
      context: {
        route: "POST /api/projects/[projectId]/orchestrator/generate",
        operation: "orchestrator.generate_plan",
        projectId: ownershipCheck.project.id,
        userId: ownershipCheck.currentUser.id,
        runId,
        statusCode: 500,
      },
      error,
    });

    return NextResponse.json(
      {
        error: "Generate Plan failed",
        ...(runId ? { runId } : {}),
      },
      { status: 500 },
    );
  }
}
