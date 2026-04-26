import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/server/db";
import { getOwnedTicketOrNull } from "@/server/tickets/get-owned-ticket-or-null";
import { patchTicketSchema } from "@/server/tickets/ticket.schemas";

type RouteContext = {
  params: Promise<{ ticketId: string }>;
};

const MAX_PATCH_RETRIES = 3;

function isVersionWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = (error as { code?: string }).code;
  return code === "P2002" || code === "P2034";
}

async function patchTicketWithNewVersion(input: {
  ticketId: string;
  data: {
    title?: string;
    description?: string | null;
    status?: TicketStatus;
    priority?: TicketPriority;
  };
}) {
  return db.$transaction(async (tx) => {
    const ticketAfterPatch = await tx.ticket.update({
      where: { id: input.ticketId },
      data: {
        title: input.data.title,
        description: input.data.description,
        status: input.data.status,
        priority: input.data.priority,
      },
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        updatedAt: true,
      },
    });

    const latestTicketVersion = await tx.ticketVersion.findFirst({
      where: {
        ticketId: input.ticketId,
      },
      orderBy: {
        version: "desc",
      },
      select: {
        version: true,
      },
    });

    const nextVersionNumber = (latestTicketVersion?.version ?? 0) + 1;

    const newTicketVersion = await tx.ticketVersion.create({
      data: {
        ticketId: input.ticketId,
        version: nextVersionNumber,
        snapshot: {
          id: ticketAfterPatch.id,
          projectId: ticketAfterPatch.projectId,
          title: ticketAfterPatch.title,
          description: ticketAfterPatch.description,
          status: ticketAfterPatch.status,
          priority: ticketAfterPatch.priority,
          updatedAt: ticketAfterPatch.updatedAt.toISOString(),
        } as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        version: true,
        createdAt: true,
      },
    });

    const ticketWithCurrentVersion = await tx.ticket.update({
      where: { id: input.ticketId },
      data: {
        currentVersionId: newTicketVersion.id,
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
      version: newTicketVersion,
    };
  });
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const { ticketId } = await params;
  const ownedTicket = await getOwnedTicketOrNull(ticketId);

  if (!ownedTicket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validatedPayload = patchTicketSchema.safeParse(body);
  if (!validatedPayload.success) {
    return NextResponse.json({ error: "Invalid ticket patch payload" }, { status: 400 });
  }

  let patchResult: Awaited<ReturnType<typeof patchTicketWithNewVersion>> | null = null;

  for (let attempt = 1; attempt <= MAX_PATCH_RETRIES; attempt += 1) {
    try {
      patchResult = await patchTicketWithNewVersion({
        ticketId: ownedTicket.id,
        data: {
          title: validatedPayload.data.title,
          description: validatedPayload.data.description,
          status: validatedPayload.data.status,
          priority: validatedPayload.data.priority,
        },
      });

      break;
    } catch (error) {
      if (attempt < MAX_PATCH_RETRIES && isVersionWriteConflict(error)) {
        continue;
      }
      throw error;
    }
  }

  if (!patchResult) {
    return NextResponse.json({ error: "Ticket update conflict, please retry" }, { status: 409 });
  }

  return NextResponse.json(patchResult);
}
