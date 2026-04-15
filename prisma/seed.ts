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

const OWNER_A_TICKETS: SeedTicket[] = [
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

const OWNER_B_TICKETS: SeedTicket[] = [
  {
    title: "Integrate SSO callback handling",
    description: "Finalize OAuth callback edge cases for private repos.",
    status: TicketStatus.TODO,
    priority: TicketPriority.HIGH,
  },
  {
    title: "Add ownership guard tests",
    description: "Cover cross-owner project access with 404 assertions.",
    status: TicketStatus.IN_PROGRESS,
    priority: TicketPriority.MEDIUM,
  },
];

async function createTicketWithInitialVersion(input: { projectId: string; ticket: SeedTicket }) {
  const createdTicket = await prisma.ticket.create({
    data: {
      projectId: input.projectId,
      title: input.ticket.title,
      description: input.ticket.description,
      status: input.ticket.status,
      priority: input.ticket.priority,
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
      ticketId: createdTicket.id,
      version: 1,
      snapshot: {
        id: createdTicket.id,
        projectId: createdTicket.projectId,
        title: createdTicket.title,
        description: createdTicket.description,
        status: createdTicket.status,
        priority: createdTicket.priority,
        updatedAt: createdTicket.updatedAt.toISOString(),
      },
    },
  });

  await prisma.ticket.update({
    where: { id: createdTicket.id },
    data: {
      currentVersionId: firstVersion.id,
    },
  });

  return createdTicket;
}

async function main() {
  await prisma.usage.deleteMany();
  await prisma.run.deleteMany();
  await prisma.event.deleteMany();
  await prisma.ticketVersion.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.project.deleteMany();
  await prisma.agent.deleteMany();
  await prisma.user.deleteMany();

  const ownerA = await prisma.user.create({
    data: {
      email: "owner.a@ai-agile.local",
      name: "Owner A",
    },
  });

  const ownerAProject = await prisma.project.create({
    data: {
      name: "AI Agile Owner A Project",
      description: "Owner A baseline project for Epic 1 and Epic 2.2 verification.",
      ownerId: ownerA.id,
    },
  });

  const ownerATickets = [];

  for (const seedTicket of OWNER_A_TICKETS) {
    const ticket = await createTicketWithInitialVersion({
      projectId: ownerAProject.id,
      ticket: seedTicket,
    });
    ownerATickets.push(ticket);
  }

  await createValidatedEvent(prisma, {
    type: EventType.WORKLOG_ADDED,
    projectId: ownerAProject.id,
    ticketId: ownerATickets[0]?.id ?? null,
    payload: {
      agentRole: "ENGINEER",
      summary: "Initial worklog entry for owner A ticket.",
      artifacts: ["docs/epic-1-notes.md"],
    },
  });

  await createValidatedEvent(prisma, {
    type: EventType.DECISION_MADE,
    projectId: ownerAProject.id,
    ticketId: ownerATickets[1]?.id ?? null,
    payload: {
      decision: "Use transaction-based ticket updates.",
      reason: "Guarantees version and event consistency.",
    },
  });

  await createValidatedEvent(prisma, {
    type: EventType.REPLAN_REQUESTED,
    projectId: ownerAProject.id,
    payload: {
      triggeredBy: "system",
      reason: "Dependency changes affected timeline.",
    },
  });

  const ownerB = await prisma.user.create({
    data: {
      email: "owner.b@ai-agile.local",
      name: "Owner B",
    },
  });

  const ownerBProject = await prisma.project.create({
    data: {
      name: "AI Agile Owner B Project",
      description: "Second-owner project for Epic 2.2 owner-only verification.",
      ownerId: ownerB.id,
    },
  });

  const ownerBTickets = [];

  for (const seedTicket of OWNER_B_TICKETS) {
    const ticket = await createTicketWithInitialVersion({
      projectId: ownerBProject.id,
      ticket: seedTicket,
    });
    ownerBTickets.push(ticket);
  }

  await createValidatedEvent(prisma, {
    type: EventType.WORKLOG_ADDED,
    projectId: ownerBProject.id,
    ticketId: ownerBTickets[0]?.id ?? null,
    payload: {
      agentRole: "PM",
      summary: "Kickoff notes for owner B project.",
    },
  });

  await createValidatedEvent(prisma, {
    type: EventType.BLOCKER_FOUND,
    projectId: ownerBProject.id,
    ticketId: ownerBTickets[1]?.id ?? null,
    payload: {
      blocker: "Missing callback whitelist in staging.",
      impact: "Cannot complete login tests for external pilot users.",
      suggestedNext: "Update provider settings and retry end-to-end auth tests.",
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
