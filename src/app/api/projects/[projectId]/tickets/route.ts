import type { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { assertProjectOwnership } from "@/server/projects/assert-project-ownership";
import { createTicketSchema } from "@/server/tickets/ticket.schemas";

type RouteContext = {
  params: Promise<{ projectId: string }>;
};

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

  const validatedPayload = createTicketSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid ticket payload" }, { status: 400 });
  }

  const ticketCreationResult = await db.$transaction(async (tx) => {
    const initialTicket = await tx.ticket.create({
      data: {
        projectId: ownershipCheck.project.id,
        title: validatedPayload.data.title,
        description: validatedPayload.data.description ?? null,
        status: validatedPayload.data.status,
        priority: validatedPayload.data.priority,
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const initialTicketVersion = await tx.ticketVersion.create({
      data: {
        ticketId: initialTicket.id,
        version: 1,
        snapshot: {
          id: initialTicket.id,
          projectId: initialTicket.projectId,
          title: initialTicket.title,
          description: initialTicket.description,
          status: initialTicket.status,
          priority: initialTicket.priority,
          updatedAt: initialTicket.updatedAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        version: true,
        createdAt: true,
      },
    });

    const ticketWithCurrentVersion = await tx.ticket.update({
      where: { id: initialTicket.id },
      data: {
        currentVersionId: initialTicketVersion.id,
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        currentVersionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      ticket: ticketWithCurrentVersion,
      version: initialTicketVersion,
    };
  });

  return NextResponse.json(ticketCreationResult, { status: 201 });
}

export async function GET(_: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const ownershipCheck = await assertProjectOwnership(projectId);

  if (!ownershipCheck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const tickets = await db.ticket.findMany({
    where: {
      projectId: ownershipCheck.project.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      currentVersionId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(tickets);
}
