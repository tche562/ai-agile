import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { EventType, PrismaClient, TicketPriority, TicketStatus } from "@prisma/client";

import { createValidatedEvent } from "../src/server/events/service";

const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the seed script.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });

const prisma = new PrismaClient({
  adapter,
});

type SeedTicket = {
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
};

const SEED_TICKETS: SeedTicket[] = [
  {
    title: "Set up project skeleton",
    description: "Create base architecture and conventions.",
    status: TicketStatus.DONE,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Define event schemas",
    description: "Capture core event payload types in Zod.",
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.CRITICAL,
  },
  {
    title: "Implement ticket versioning service",
    description: "Persist snapshots after every ticket update.",
    status: TicketStatus.TODO,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Wire up project dashboard page",
    description: "Show project-level metrics and latest activity.",
    status: TicketStatus.BACKLOG,
    priority: TicketPriority.MEDIUM,
  },
  {
    title: "Add regression tests for update flow",
    description: "Protect versioning and event validation behavior.",
    status: TicketStatus.BLOCKED,
    priority: TicketPriority.LOW,
  },
];

async function main() {
  await prisma.usage.deleteMany();
  await prisma.run.deleteMany();
  await prisma.event.deleteMany();
  await prisma.ticketVersion.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.project.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.user.deleteMany();

  const demoUser = await prisma.user.create({
    data: {
      email: "demo.user@ai-agile.local",
      name: "Demo User",
    },
  });

  const demoProject = await prisma.project.create({
    data: {
      name: "AI Agile Demo",
      description: "Seeded project for Epic 1 data model verification.",
      ownerId: demoUser.id,
    },
  });

  const tickets = [];

  for (const seedTicket of SEED_TICKETS) {
    const ticket = await prisma.ticket.create({
      data: {
        projectId: demoProject.id,
        title: seedTicket.title,
        description: seedTicket.description,
        status: seedTicket.status,
        priority: seedTicket.priority,
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

    const firstVersion = await prisma.ticketVersion.create({
      data: {
        ticketId: ticket.id,
        version: 1,
        snapshot: {
          id: ticket.id,
          projectId: ticket.projectId,
          title: ticket.title,
          description: ticket.description,
          status: ticket.status,
          priority: ticket.priority,
          updatedAt: ticket.updatedAt.toISOString(),
        },
      },
    });

    await prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        currentVersionId: firstVersion.id,
      },
    });

    tickets.push(ticket);
  }

  await createValidatedEvent(prisma, {
    type: EventType.WORKLOG_ADDED,
    projectId: demoProject.id,
    ticketId: tickets[0]?.id ?? null,
    payload: {
      agentRole: "ENGINEER",
      summary: "Initial worklog entry for demo ticket.",
      artifacts: ["docs/epic-1-notes.md"],
    },
  });

  await createValidatedEvent(prisma, {
    type: EventType.DECISION_MADE,
    projectId: demoProject.id,
    ticketId: tickets[1]?.id ?? null,
    payload: {
      decision: "Use transaction-based ticket updates.",
      reason: "Guarantees version and event consistency.",
    },
  });

  await createValidatedEvent(prisma, {
    type: EventType.REPLAN_REQUESTED,
    projectId: demoProject.id,
    payload: {
      triggeredBy: "system",
      reason: "Dependency changes affected timeline.",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
