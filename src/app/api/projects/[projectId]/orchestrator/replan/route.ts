import { NextResponse } from "next/server";
import { z } from "zod";

import { llmErrorToResponse } from "@/server/llm";
import { replanProject } from "@/server/orchestrator/service";
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
    const llmResponse = llmErrorToResponse(error);
    if (llmResponse) {
      return llmResponse;
    }

    return NextResponse.json({ error: "Replan failed" }, { status: 500 });
  }
}
