import { NextResponse } from "next/server";

import { assertProjectOwnership } from "@/server/projects/assert-project-ownership";
import { db } from "@/server/db";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

export async function GET(_: Request, { params }: RouteContext) {
  const { projectId } = await params;

  const result = await assertProjectOwnership(projectId);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result.project);
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { projectId } = await params;

  const result = await assertProjectOwnership(projectId);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await request.json();

  const updatedProject = await db.project.update({
    where: { id: result.project.id },
    data: {
      name: body.name,
    },
  });

  return NextResponse.json(updatedProject);
}
