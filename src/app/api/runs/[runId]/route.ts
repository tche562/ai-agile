import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { getOwnedRunOrNull } from "@/server/runs/get-owned-run-or-null";
import { patchRunSchema } from "@/server/runs/schemas";
import { canTransitionRunStatus, isTerminalRunStatus } from "@/server/runs/status-machine";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function PATCH(request: Request, { params }: RouteContext) {
  const { runId } = await params;
  const ownedRun = await getOwnedRunOrNull(runId);

  if (!ownedRun) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validatedPayload = patchRunSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid run patch payload" }, { status: 400 });
  }

  const nextStatus = validatedPayload.data.status;
  if (!canTransitionRunStatus(ownedRun.status, nextStatus)) {
    return NextResponse.json({ error: "Invalid run status transition" }, { status: 400 });
  }

  if (nextStatus === ownedRun.status) {
    return NextResponse.json(ownedRun);
  }

  const patchedRun = await db.run.update({
    where: {
      id: ownedRun.id,
    },
    data: {
      status: nextStatus,
      finishedAt: isTerminalRunStatus(nextStatus) ? new Date() : null,
    },
  });

  return NextResponse.json(patchedRun);
}
