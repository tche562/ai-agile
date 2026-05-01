import { TicketStatus, type Prisma } from "@prisma/client";

import { db } from "../db";
import {
  orchestratorInputSchema,
  type OrchestratorInput,
  type RecentEventSummary,
  type TicketHarness,
} from "./schemas";
import { summarizeEventForReplan } from "./event-summary";

const DEFAULT_RECENT_EVENT_LIMIT = 30;
const DEFAULT_ACTIVE_TICKET_LIMIT = 100;
const REPLAN_MUTABLE_OR_ACTIVE_STATUSES = [
  TicketStatus.BACKLOG,
  TicketStatus.TODO,
  TicketStatus.IN_PROGRESS,
  TicketStatus.IN_REVIEW,
  TicketStatus.BLOCKED,
] as const;

export type GeneratePlanContext = {
  input: OrchestratorInput;
  existingTicketCount: number;
};

export type BuildReplanContextOptions = {
  recentEventLimit?: number;
  activeTicketLimit?: number;
};

function extractHarness(snapshot: Prisma.JsonValue | null | undefined): TicketHarness | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const harness = (snapshot as Record<string, unknown>)["harness"];
  if (!harness || typeof harness !== "object" || Array.isArray(harness)) {
    return null;
  }

  return harness as TicketHarness;
}

export async function buildGeneratePlanContext(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: userId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      _count: {
        select: {
          tickets: true,
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    input: orchestratorInputSchema.parse({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      currentTickets: [],
      recentEvents: [],
    }),
    existingTicketCount: project._count.tickets,
  } satisfies GeneratePlanContext;
}

export async function buildReplanContext(
  projectId: string,
  userId: string,
  options: BuildReplanContextOptions = {},
) {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: userId,
    },
    select: {
      id: true,
      name: true,
      description: true,
    },
  });

  if (!project) {
    return null;
  }

  const [tickets, recentEventsDesc] = await Promise.all([
    db.ticket.findMany({
      where: {
        projectId,
        status: {
          in: [...REPLAN_MUTABLE_OR_ACTIVE_STATUSES],
        },
      },
      orderBy: {
        createdAt: "asc",
      },
      take: options.activeTicketLimit ?? DEFAULT_ACTIVE_TICKET_LIMIT,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        currentVersion: {
          select: {
            snapshot: true,
          },
        },
      },
    }),
    db.event.findMany({
      where: {
        projectId,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: options.recentEventLimit ?? DEFAULT_RECENT_EVENT_LIMIT,
      select: {
        id: true,
        type: true,
        ticketId: true,
        createdAt: true,
        payload: true,
      },
    }),
  ]);

  const recentEvents: RecentEventSummary[] = recentEventsDesc.reverse().map((event) => ({
    id: event.id,
    type: event.type,
    ticketId: event.ticketId,
    createdAt: event.createdAt.toISOString(),
    summary: summarizeEventForReplan(event.type, event.payload),
    payload: event.payload,
  }));

  return orchestratorInputSchema.parse({
    project,
    currentTickets: tickets.map((ticket) => ({
      id: ticket.id,
      title: ticket.title,
      description: ticket.description,
      status: ticket.status,
      priority: ticket.priority,
      harness: extractHarness(ticket.currentVersion?.snapshot),
    })),
    recentEvents,
  });
}
