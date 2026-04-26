import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { assertProjectOwnership } from "@/server/projects/assert-project-ownership";
import { createRunSchema } from "@/server/runs/schemas";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

async function ensureTicketInProjectOrNull(input: { projectId: string; ticketId: string }) {
  return db.ticket.findFirst({
    where: {
      id: input.ticketId,
      projectId: input.projectId,
    },
    select: {
      id: true,
    },
  });
}

async function ensureAgentOrNull(agentId: string) {
  return db.agent.findUnique({
    where: {
      id: agentId,
    },
    select: {
      id: true,
    },
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const ownershipCheck = await assertProjectOwnership(projectId);

  if (!ownershipCheck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validatedPayload = createRunSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
  }

  const ticketId = validatedPayload.data.ticketId ?? null;
  if (ticketId) {
    const ticket = await ensureTicketInProjectOrNull({
      projectId: ownershipCheck.project.id,
      ticketId,
    });
    if (!ticket) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const agentId = validatedPayload.data.agentId ?? null;
  if (agentId) {
    const agent = await ensureAgentOrNull(agentId);
    if (!agent) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const run = await db.run.create({
    data: {
      type: validatedPayload.data.type,
      projectId: ownershipCheck.project.id,
      ticketId,
      agentId,
    },
  });

  return NextResponse.json(run, { status: 201 });
}
