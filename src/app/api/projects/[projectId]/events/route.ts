import { EventType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/server/db";
import { createValidatedEvent } from "@/server/events/service";
import { assertProjectOwnership } from "@/server/projects/assert-project-ownership";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

const createEventRequestSchema = z.object({
  type: z.nativeEnum(EventType),
  payload: z.unknown(),
  ticketId: z.string().min(1).optional(),
});

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

  const validatedPayload = createEventRequestSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
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

  try {
    const event = await createValidatedEvent(db, {
      type: validatedPayload.data.type,
      payload: validatedPayload.data.payload,
      projectId: ownershipCheck.project.id,
      ticketId,
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
    }

    throw error;
  }
}

export async function GET(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const ownershipCheck = await assertProjectOwnership(projectId);

  if (!ownershipCheck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const ticketIdParam = url.searchParams.get("ticketId");
  const ticketId = ticketIdParam?.trim() ? ticketIdParam.trim() : null;

  if (ticketId) {
    const ticket = await ensureTicketInProjectOrNull({
      projectId: ownershipCheck.project.id,
      ticketId,
    });
    if (!ticket) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const events = await db.event.findMany({
    where: {
      projectId: ownershipCheck.project.id,
      ...(ticketId ? { ticketId } : {}),
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return NextResponse.json(events);
}
