import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { EventType } from "@prisma/client";

import { db } from "../db";
import { createValidatedEvent } from "../events/service";

const UPDATABLE_FIELDS = ["title", "description", "status", "priority"] as const;

type UpdatableTicketField = (typeof UPDATABLE_FIELDS)[number];

type TicketUpdateData = {
  title?: string;
  description?: string | null;
  status?: TicketStatus;
  priority?: TicketPriority;
};

export type UpdateTicketInput = {
  ticketId: string;
  data: TicketUpdateData;
  summary: string;
};

type TicketSnapshot = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: string;
};

function getChangedFields(data: TicketUpdateData): UpdatableTicketField[] {
  return UPDATABLE_FIELDS.filter((field) => data[field] !== undefined);
}

function toSnapshot(ticket: {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  updatedAt: Date;
}): TicketSnapshot {
  return {
    id: ticket.id,
    projectId: ticket.projectId,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    updatedAt: ticket.updatedAt.toISOString(),
  };
}

export async function updateTicket(input: UpdateTicketInput) {
  const fieldsChanged = getChangedFields(input.data);

  if (fieldsChanged.length === 0) {
    throw new Error("updateTicket requires at least one changed field.");
  }

  return db.$transaction(async (tx) => {
    const existingTicket = await tx.ticket.findUnique({
      where: { id: input.ticketId },
      select: {
        id: true,
      },
    });

    if (!existingTicket) {
      throw new Error(`Ticket not found: ${input.ticketId}`);
    }

    const updatedTicket = await tx.ticket.update({
      where: { id: input.ticketId },
      data: input.data,
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

    const latestVersion = await tx.ticketVersion.findFirst({
      where: { ticketId: input.ticketId },
      orderBy: { version: "desc" },
      select: {
        version: true,
      },
    });

    const nextVersion = (latestVersion?.version ?? 0) + 1;

    const createdVersion = await tx.ticketVersion.create({
      data: {
        ticketId: input.ticketId,
        version: nextVersion,
        snapshot: toSnapshot(updatedTicket) as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        version: true,
      },
    });

    const ticket = await tx.ticket.update({
      where: { id: input.ticketId },
      data: {
        currentVersionId: createdVersion.id,
      },
      select: {
        id: true,
        projectId: true,
        currentVersionId: true,
      },
    });

    const event = await createValidatedEvent(tx, {
      type: EventType.TICKET_UPDATED,
      projectId: ticket.projectId,
      ticketId: ticket.id,
      payload: {
        fieldsChanged,
        summary: input.summary,
      },
    });

    return {
      ticket,
      version: createdVersion,
      event,
    };
  });
}
