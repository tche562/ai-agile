import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";

export type TicketWithCurrentVersion = Prisma.TicketGetPayload<{
  include: {
    currentVersion: true;
  };
}>;

export type TicketExecutionContextDTO = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  harness: unknown | null;
  createdAt: string;
  updatedAt: string;
};

export function extractHarnessFromSnapshot(snapshot: Prisma.JsonValue): unknown | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const harness = (snapshot as Record<string, unknown>)["harness"];
  return harness ?? null;
}

export function toTicketExecutionDTO(ticket: TicketWithCurrentVersion): TicketExecutionContextDTO {
  return {
    id: ticket.id,
    projectId: ticket.projectId,
    title: ticket.title,
    description: ticket.description,
    status: ticket.status,
    priority: ticket.priority,
    currentVersionId: ticket.currentVersionId,
    currentVersionNumber: ticket.currentVersion?.version ?? null,
    harness: ticket.currentVersion
      ? extractHarnessFromSnapshot(ticket.currentVersion.snapshot)
      : null,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
  };
}
