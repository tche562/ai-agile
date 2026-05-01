import { EventType, TicketStatus, type Prisma } from "@prisma/client";

import { db } from "../db";
import { createValidatedEvent } from "../events/service";
import type { OrchestratorOutput, TicketHarness } from "./schemas";

// In this project, "unstarted mutable tickets" are BACKLOG and TODO.
export const MUTABLE_TICKET_STATUSES = [TicketStatus.BACKLOG, TicketStatus.TODO] as const;

type MutableTicketStatus = (typeof MUTABLE_TICKET_STATUSES)[number];

export type FieldDiff = {
  field: string;
  before: unknown;
  after: unknown;
};

export type AppliedTicketSummary = {
  ticketId: string;
  title: string;
};

export type UpdatedTicketSummary = {
  ticketId: string;
  title: string;
  diffs: FieldDiff[];
};

export type RejectedChange = {
  ticketId?: string;
  action: "update" | "close";
  reason: string;
};

export type ApplyOrchestratorPlanInput = {
  projectId: string;
  userId: string;
  runId?: string;
  plan: OrchestratorOutput;
};

export type ApplyOrchestratorPlanResult = {
  createdTickets: AppliedTicketSummary[];
  updatedTickets: UpdatedTicketSummary[];
  closedTickets: UpdatedTicketSummary[];
  rejectedChanges: RejectedChange[];
  rationale: string;
};

type ExistingTicket = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  currentVersion: {
    id: string;
    version: number;
    snapshot: Prisma.JsonValue;
  } | null;
  updatedAt: Date;
};

type TicketSnapshot = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: ExistingTicket["priority"];
  updatedAt: string;
  harness?: TicketHarness;
  closedReason?: string;
};

function isMutableStatus(status: TicketStatus): status is MutableTicketStatus {
  return MUTABLE_TICKET_STATUSES.includes(status as MutableTicketStatus);
}

function extractHarness(snapshot: Prisma.JsonValue | null): TicketHarness | undefined {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return undefined;
  }

  if (!("harness" in snapshot)) {
    return undefined;
  }

  const harness = (snapshot as Record<string, unknown>)["harness"];
  if (!harness || typeof harness !== "object" || Array.isArray(harness)) {
    return undefined;
  }

  return harness as TicketHarness;
}

function serializeComparableValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function isSameValue(left: unknown, right: unknown): boolean {
  return serializeComparableValue(left) === serializeComparableValue(right);
}

async function findExistingTicket(
  tx: Prisma.TransactionClient,
  args: { ticketId: string; projectId: string },
): Promise<ExistingTicket | null> {
  const ticket = await tx.ticket.findFirst({
    where: {
      id: args.ticketId,
      projectId: args.projectId,
    },
    select: {
      id: true,
      projectId: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      updatedAt: true,
      currentVersion: {
        select: {
          id: true,
          version: true,
          snapshot: true,
        },
      },
    },
  });

  if (!ticket) {
    return null;
  }

  return ticket as ExistingTicket;
}

async function getLatestTicketVersion(
  tx: Prisma.TransactionClient,
  args: { ticketId: string; currentVersion: ExistingTicket["currentVersion"] },
) {
  if (args.currentVersion) {
    return args.currentVersion;
  }

  return tx.ticketVersion.findFirst({
    where: {
      ticketId: args.ticketId,
    },
    orderBy: {
      version: "desc",
    },
    select: {
      id: true,
      version: true,
      snapshot: true,
    },
  });
}

async function createVersionAndSetCurrent(
  tx: Prisma.TransactionClient,
  args: {
    ticketId: string;
    latestVersionNumber: number;
    snapshot: TicketSnapshot;
  },
) {
  const createdVersion = await tx.ticketVersion.create({
    data: {
      ticketId: args.ticketId,
      version: args.latestVersionNumber + 1,
      snapshot: args.snapshot as Prisma.InputJsonValue,
    },
    select: {
      id: true,
      version: true,
    },
  });

  await tx.ticket.update({
    where: { id: args.ticketId },
    data: {
      currentVersionId: createdVersion.id,
    },
  });

  return createdVersion;
}

export async function applyOrchestratorPlan(
  input: ApplyOrchestratorPlanInput,
): Promise<ApplyOrchestratorPlanResult> {
  return db.$transaction(async (tx) => {
    const createdTickets: AppliedTicketSummary[] = [];
    const updatedTickets: UpdatedTicketSummary[] = [];
    const closedTickets: UpdatedTicketSummary[] = [];
    const rejectedChanges: RejectedChange[] = [];

    for (const proposal of input.plan.createTickets) {
      const createdTicket = await tx.ticket.create({
        data: {
          projectId: input.projectId,
          title: proposal.title,
          description: proposal.description,
          priority: proposal.priority,
          status: TicketStatus.BACKLOG,
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

      await createVersionAndSetCurrent(tx, {
        ticketId: createdTicket.id,
        latestVersionNumber: 0,
        snapshot: {
          id: createdTicket.id,
          projectId: createdTicket.projectId,
          title: createdTicket.title,
          description: createdTicket.description,
          status: createdTicket.status,
          priority: createdTicket.priority,
          updatedAt: createdTicket.updatedAt.toISOString(),
          harness: proposal.harness,
        },
      });

      createdTickets.push({
        ticketId: createdTicket.id,
        title: createdTicket.title,
      });
    }

    for (const proposal of input.plan.updateTickets) {
      const existingTicket = await findExistingTicket(tx, {
        ticketId: proposal.ticketId,
        projectId: input.projectId,
      });

      if (!existingTicket) {
        rejectedChanges.push({
          ticketId: proposal.ticketId,
          action: "update",
          reason: "Ticket not found in project.",
        });
        continue;
      }

      if (!isMutableStatus(existingTicket.status)) {
        rejectedChanges.push({
          ticketId: proposal.ticketId,
          action: "update",
          reason: "Ticket status is not mutable.",
        });
        continue;
      }

      const latestVersion = await getLatestTicketVersion(tx, {
        ticketId: existingTicket.id,
        currentVersion: existingTicket.currentVersion,
      });
      const previousHarness = extractHarness(latestVersion?.snapshot ?? null);

      const nextTitle = proposal.title ?? existingTicket.title;
      const nextDescription = proposal.description ?? existingTicket.description;
      const nextPriority = proposal.priority ?? existingTicket.priority;
      const nextHarness = proposal.harness ?? previousHarness;

      const diffs: FieldDiff[] = [];

      if (proposal.title !== undefined && !isSameValue(existingTicket.title, nextTitle)) {
        diffs.push({
          field: "title",
          before: existingTicket.title,
          after: nextTitle,
        });
      }

      if (
        proposal.description !== undefined &&
        !isSameValue(existingTicket.description, nextDescription)
      ) {
        diffs.push({
          field: "description",
          before: existingTicket.description,
          after: nextDescription,
        });
      }

      if (proposal.priority !== undefined && !isSameValue(existingTicket.priority, nextPriority)) {
        diffs.push({
          field: "priority",
          before: existingTicket.priority,
          after: nextPriority,
        });
      }

      if (proposal.harness !== undefined && !isSameValue(previousHarness, proposal.harness)) {
        diffs.push({
          field: "harness",
          before: previousHarness,
          after: proposal.harness,
        });
      }

      if (diffs.length === 0) {
        rejectedChanges.push({
          ticketId: proposal.ticketId,
          action: "update",
          reason: "No effective changes.",
        });
        continue;
      }

      let ticketAfterUpdate = existingTicket;
      if (
        proposal.title !== undefined ||
        proposal.description !== undefined ||
        proposal.priority !== undefined
      ) {
        ticketAfterUpdate = (await tx.ticket.update({
          where: {
            id: existingTicket.id,
          },
          data: {
            title: proposal.title,
            description: proposal.description,
            priority: proposal.priority,
          },
          select: {
            id: true,
            projectId: true,
            title: true,
            description: true,
            status: true,
            priority: true,
            updatedAt: true,
            currentVersion: {
              select: {
                id: true,
                version: true,
                snapshot: true,
              },
            },
          },
        })) as ExistingTicket;
      }

      await createVersionAndSetCurrent(tx, {
        ticketId: ticketAfterUpdate.id,
        latestVersionNumber: latestVersion?.version ?? 0,
        snapshot: {
          id: ticketAfterUpdate.id,
          projectId: ticketAfterUpdate.projectId,
          title: ticketAfterUpdate.title,
          description: ticketAfterUpdate.description,
          status: ticketAfterUpdate.status,
          priority: ticketAfterUpdate.priority,
          updatedAt: ticketAfterUpdate.updatedAt.toISOString(),
          ...(nextHarness ? { harness: nextHarness } : {}),
        },
      });

      updatedTickets.push({
        ticketId: ticketAfterUpdate.id,
        title: ticketAfterUpdate.title,
        diffs,
      });
    }

    for (const proposal of input.plan.closeTickets) {
      const existingTicket = await findExistingTicket(tx, {
        ticketId: proposal.ticketId,
        projectId: input.projectId,
      });

      if (!existingTicket) {
        rejectedChanges.push({
          ticketId: proposal.ticketId,
          action: "close",
          reason: "Ticket not found in project.",
        });
        continue;
      }

      if (!isMutableStatus(existingTicket.status)) {
        rejectedChanges.push({
          ticketId: proposal.ticketId,
          action: "close",
          reason: "Ticket status is not mutable.",
        });
        continue;
      }

      const latestVersion = await getLatestTicketVersion(tx, {
        ticketId: existingTicket.id,
        currentVersion: existingTicket.currentVersion,
      });
      const previousHarness = extractHarness(latestVersion?.snapshot ?? null);

      const ticketAfterClose = await tx.ticket.update({
        where: {
          id: existingTicket.id,
        },
        data: {
          status: TicketStatus.DONE,
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

      await createVersionAndSetCurrent(tx, {
        ticketId: ticketAfterClose.id,
        latestVersionNumber: latestVersion?.version ?? 0,
        snapshot: {
          id: ticketAfterClose.id,
          projectId: ticketAfterClose.projectId,
          title: ticketAfterClose.title,
          description: ticketAfterClose.description,
          status: ticketAfterClose.status,
          priority: ticketAfterClose.priority,
          updatedAt: ticketAfterClose.updatedAt.toISOString(),
          ...(previousHarness ? { harness: previousHarness } : {}),
          closedReason: proposal.reason,
        },
      });

      closedTickets.push({
        ticketId: ticketAfterClose.id,
        title: ticketAfterClose.title,
        diffs: [
          {
            field: "status",
            before: existingTicket.status,
            after: TicketStatus.DONE,
          },
        ],
      });
    }

    const result: ApplyOrchestratorPlanResult = {
      createdTickets,
      updatedTickets,
      closedTickets,
      rejectedChanges,
      rationale: input.plan.rationale,
    };

    await createValidatedEvent(tx, {
      type: EventType.REPLAN_APPLIED,
      projectId: input.projectId,
      ticketId: null,
      payload: {
        source: "orchestrator",
        runId: input.runId ?? null,
        userId: input.userId,
        rationale: input.plan.rationale,
        createdTickets,
        updatedTickets,
        closedTickets,
        rejectedChanges,
        createdTicketIds: createdTickets.map((item) => item.ticketId),
        updatedTicketIds: updatedTickets.map((item) => item.ticketId),
        closedTicketIds: closedTickets.map((item) => item.ticketId),
      } as Prisma.InputJsonValue,
    });

    return result;
  });
}
