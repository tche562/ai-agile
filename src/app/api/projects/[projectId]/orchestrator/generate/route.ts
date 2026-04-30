import { NextResponse } from "next/server";

import { llmErrorToResponse } from "@/server/llm";
import { generatePlan, GeneratePlanAlreadyExistsError } from "@/server/orchestrator/service";
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
    if (error instanceof GeneratePlanAlreadyExistsError) {
      return NextResponse.json(
        { error: "Generate Plan can only run for projects without existing tickets" },
        { status: 409 },
      );
    }

    const llmResponse = llmErrorToResponse(error);
    if (llmResponse) {
      return llmResponse;
    }

    return NextResponse.json({ error: "Generate Plan failed" }, { status: 500 });
  }
}
