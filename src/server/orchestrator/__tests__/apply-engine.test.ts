import { EventType, TicketPriority, TicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockTransaction } = vi.hoisted(() => ({
  mockTransaction: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    $transaction: mockTransaction,
  },
}));

import { applyOrchestratorPlan } from "../apply-engine";
import { orchestratorOutputSchema, type TicketHarness } from "../schemas";

type TicketRow = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  currentVersionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type TicketVersionRow = {
  id: string;
  ticketId: string;
  version: number;
  snapshot: Record<string, unknown>;
  createdAt: Date;
};

type EventRow = {
  id: string;
  type: EventType;
  projectId: string;
  ticketId: string | null;
  payload: Record<string, unknown>;
  createdAt: Date;
};

type InMemoryState = {
  tickets: TicketRow[];
  ticketVersions: TicketVersionRow[];
  events: EventRow[];
  idCounter: number;
};

function makeHarness(name: string): TicketHarness {
  return {
    goal: `${name} goal`,
    inputs: [`${name} input`],
    output_format: [`${name} output`],
    acceptance_checks: [`${name} check`],
    non_goals: [`${name} non-goal`],
    risks: [`${name} risk`],
    test_ideas: [`${name} test`],
  };
}

function createState(): InMemoryState {
  return {
    tickets: [],
    ticketVersions: [],
    events: [],
    idCounter: 1,
  };
}

function nextId(state: InMemoryState, prefix: string): string {
  const value = `${prefix}-${state.idCounter}`;
  state.idCounter += 1;
  return value;
}

function seedTicketWithVersion(input: {
  state: InMemoryState;
  ticketId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TicketStatus;
  priority: TicketPriority;
  harness?: TicketHarness;
}): { ticketId: string; versionId: string } {
  const versionId = nextId(input.state, "version");
  const now = new Date();

  input.state.tickets.push({
    id: input.ticketId,
    projectId: input.projectId,
    title: input.title,
    description: input.description,
    status: input.status,
    priority: input.priority,
    currentVersionId: versionId,
    createdAt: now,
    updatedAt: now,
  });

  input.state.ticketVersions.push({
    id: versionId,
    ticketId: input.ticketId,
    version: 1,
    snapshot: {
      id: input.ticketId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      ...(input.harness ? { harness: input.harness } : {}),
    },
    createdAt: now,
  });

  return { ticketId: input.ticketId, versionId };
}

function buildTx(state: InMemoryState) {
  return {
    ticket: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const now = new Date();
        const ticket: TicketRow = {
          id: nextId(state, "ticket"),
          projectId: data.projectId as string,
          title: data.title as string,
          description: (data.description as string | null | undefined) ?? null,
          status: (data.status as TicketStatus | undefined) ?? TicketStatus.BACKLOG,
          priority: (data.priority as TicketPriority | undefined) ?? TicketPriority.MEDIUM,
          currentVersionId: null,
          createdAt: now,
          updatedAt: now,
        };
        state.tickets.push(ticket);
        return { ...ticket };
      }),
      update: vi
        .fn()
        .mockImplementation(
          async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
            const ticket = state.tickets.find((item) => item.id === where.id);
            if (!ticket) {
              throw new Error(`Ticket not found: ${where.id}`);
            }

            if (data.title !== undefined) {
              ticket.title = data.title as string;
            }
            if (data.description !== undefined) {
              ticket.description = data.description as string | null;
            }
            if (data.status !== undefined) {
              ticket.status = data.status as TicketStatus;
            }
            if (data.priority !== undefined) {
              ticket.priority = data.priority as TicketPriority;
            }
            if (data.currentVersionId !== undefined) {
              ticket.currentVersionId = data.currentVersionId as string | null;
            }

            ticket.updatedAt = new Date();

            const currentVersion = ticket.currentVersionId
              ? (state.ticketVersions.find((item) => item.id === ticket.currentVersionId) ?? null)
              : null;

            return {
              ...ticket,
              currentVersion: currentVersion
                ? {
                    id: currentVersion.id,
                    version: currentVersion.version,
                    snapshot: currentVersion.snapshot,
                  }
                : null,
            };
          },
        ),
      findFirst: vi
        .fn()
        .mockImplementation(async ({ where }: { where: { id: string; projectId: string } }) => {
          const ticket = state.tickets.find(
            (item) => item.id === where.id && item.projectId === where.projectId,
          );
          if (!ticket) {
            return null;
          }

          const currentVersion = ticket.currentVersionId
            ? (state.ticketVersions.find((item) => item.id === ticket.currentVersionId) ?? null)
            : null;

          return {
            ...ticket,
            currentVersion: currentVersion
              ? {
                  id: currentVersion.id,
                  version: currentVersion.version,
                  snapshot: currentVersion.snapshot,
                }
              : null,
          };
        }),
    },
    ticketVersion: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const created: TicketVersionRow = {
          id: nextId(state, "version"),
          ticketId: data.ticketId as string,
          version: data.version as number,
          snapshot: data.snapshot as Record<string, unknown>,
          createdAt: new Date(),
        };
        state.ticketVersions.push(created);
        return { ...created };
      }),
      findFirst: vi.fn().mockImplementation(async ({ where }: { where: { ticketId: string } }) => {
        const versions = state.ticketVersions
          .filter((item) => item.ticketId === where.ticketId)
          .sort((left, right) => right.version - left.version);

        if (versions.length === 0) {
          return null;
        }

        return { ...versions[0] };
      }),
    },
    event: {
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const created: EventRow = {
          id: nextId(state, "event"),
          type: data.type as EventType,
          projectId: data.projectId as string,
          ticketId: (data.ticketId as string | null | undefined) ?? null,
          payload: data.payload as Record<string, unknown>,
          createdAt: new Date(),
        };
        state.events.push(created);
        return { ...created };
      }),
    },
  };
}

describe("applyOrchestratorPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates tickets with initial TicketVersion and writes REPLAN_APPLIED event", async () => {
    const state = createState();
    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [
        {
          title: "Build dashboard",
          description: "Create dashboard for project status.",
          priority: "HIGH",
          harness: makeHarness("create-1"),
        },
      ],
      updateTickets: [],
      closeTickets: [],
      rationale: "Initial backlog seeding from orchestrator.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-1",
      plan,
    });

    expect(result.createdTickets).toHaveLength(1);
    expect(state.tickets).toHaveLength(1);
    expect(state.ticketVersions).toHaveLength(1);
    expect(state.tickets[0]?.currentVersionId).toBe(state.ticketVersions[0]?.id);
    expect(state.ticketVersions[0]?.snapshot.harness).toEqual(makeHarness("create-1"));

    expect(state.events).toHaveLength(1);
    expect(state.events[0]?.type).toBe(EventType.REPLAN_APPLIED);
  });

  it("updates mutable tickets and creates new TicketVersion with field diffs", async () => {
    const state = createState();
    seedTicketWithVersion({
      state,
      ticketId: "ticket-update",
      projectId: "project-1",
      title: "Old title",
      description: "Old description",
      status: TicketStatus.BACKLOG,
      priority: TicketPriority.LOW,
      harness: makeHarness("old"),
    });

    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket-update",
          title: "New title",
          description: "New description",
          priority: "CRITICAL",
          harness: makeHarness("new"),
          reason: "Scope update",
        },
      ],
      closeTickets: [],
      rationale: "Apply latest scope changes.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan,
    });

    const ticket = state.tickets.find((item) => item.id === "ticket-update");
    expect(ticket?.title).toBe("New title");
    expect(ticket?.description).toBe("New description");
    expect(ticket?.priority).toBe(TicketPriority.CRITICAL);
    expect(state.ticketVersions.filter((item) => item.ticketId === "ticket-update")).toHaveLength(
      2,
    );

    expect(result.updatedTickets).toHaveLength(1);
    expect(result.updatedTickets[0]?.diffs.map((diff) => diff.field)).toEqual([
      "title",
      "description",
      "priority",
      "harness",
    ]);
  });

  it("updates TODO tickets with a new version, field diff, and REPLAN_APPLIED audit event", async () => {
    const state = createState();
    seedTicketWithVersion({
      state,
      ticketId: "ticket-todo",
      projectId: "project-1",
      title: "Draft import flow",
      description: "Design the initial import flow.",
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      harness: makeHarness("todo-original"),
    });

    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket-todo",
          description: "Design the import flow with folder scanning and review states.",
          reason: "Project scope clarified the import workflow.",
        },
      ],
      closeTickets: [],
      rationale: "Refine the TODO ticket based on new scope details.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-1",
      plan,
    });

    const versions = state.ticketVersions
      .filter((item) => item.ticketId === "ticket-todo")
      .sort((left, right) => left.version - right.version);
    const latestSnapshot = versions.at(-1)?.snapshot;

    expect(versions).toHaveLength(2);
    expect(latestSnapshot).toMatchObject({
      id: "ticket-todo",
      description: "Design the import flow with folder scanning and review states.",
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      harness: makeHarness("todo-original"),
    });
    expect(result.updatedTickets).toEqual([
      {
        ticketId: "ticket-todo",
        title: "Draft import flow",
        diffs: [
          {
            field: "description",
            before: "Design the initial import flow.",
            after: "Design the import flow with folder scanning and review states.",
          },
        ],
      },
    ]);
    expect(state.events).toHaveLength(1);
    expect(state.events[0]).toMatchObject({
      type: EventType.REPLAN_APPLIED,
      projectId: "project-1",
      ticketId: null,
    });
    expect(state.events[0]?.payload).toMatchObject({
      source: "orchestrator",
      runId: "run-1",
      userId: "user-1",
      rationale: "Refine the TODO ticket based on new scope details.",
      updatedTicketIds: ["ticket-todo"],
    });
  });

  it("does not update DONE tickets and returns rejection", async () => {
    const state = createState();
    seedTicketWithVersion({
      state,
      ticketId: "ticket-done",
      projectId: "project-1",
      title: "Done title",
      description: "Done description",
      status: TicketStatus.DONE,
      priority: TicketPriority.MEDIUM,
    });

    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket-done",
          title: "Should not change",
          reason: "Try update done ticket",
        },
      ],
      closeTickets: [],
      rationale: "Attempted immutable update.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan,
    });

    const doneTicket = state.tickets.find((item) => item.id === "ticket-done");
    expect(doneTicket?.title).toBe("Done title");
    expect(state.ticketVersions.filter((item) => item.ticketId === "ticket-done")).toHaveLength(1);
    expect(result.rejectedChanges).toEqual([
      {
        ticketId: "ticket-done",
        action: "update",
        reason: "Ticket status is not mutable.",
      },
    ]);
  });

  it("rejects updates for IN_PROGRESS / IN_REVIEW / BLOCKED tickets", async () => {
    const state = createState();
    seedTicketWithVersion({
      state,
      ticketId: "ticket-progress",
      projectId: "project-1",
      title: "In progress ticket",
      description: "desc",
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.HIGH,
    });
    seedTicketWithVersion({
      state,
      ticketId: "ticket-review",
      projectId: "project-1",
      title: "In review ticket",
      description: "desc",
      status: TicketStatus.IN_REVIEW,
      priority: TicketPriority.HIGH,
    });
    seedTicketWithVersion({
      state,
      ticketId: "ticket-blocked",
      projectId: "project-1",
      title: "Blocked ticket",
      description: "desc",
      status: TicketStatus.BLOCKED,
      priority: TicketPriority.HIGH,
    });

    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        { ticketId: "ticket-progress", title: "new", reason: "try update" },
        { ticketId: "ticket-review", title: "new", reason: "try update" },
        { ticketId: "ticket-blocked", title: "new", reason: "try update" },
      ],
      closeTickets: [],
      rationale: "Attempt invalid updates.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan,
    });

    expect(result.updatedTickets).toHaveLength(0);
    expect(result.rejectedChanges).toHaveLength(3);
    expect(
      result.rejectedChanges.every((item) => item.reason === "Ticket status is not mutable."),
    ).toBe(true);
  });

  it("closes mutable ticket as DONE with version + diff", async () => {
    const state = createState();
    seedTicketWithVersion({
      state,
      ticketId: "ticket-close",
      projectId: "project-1",
      title: "Close me",
      description: "desc",
      status: TicketStatus.TODO,
      priority: TicketPriority.MEDIUM,
      harness: makeHarness("close-harness"),
    });

    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [],
      closeTickets: [
        {
          ticketId: "ticket-close",
          reason: "No longer needed",
        },
      ],
      rationale: "Clean up stale work.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan,
    });

    const ticket = state.tickets.find((item) => item.id === "ticket-close");
    const versions = state.ticketVersions.filter((item) => item.ticketId === "ticket-close");
    const latestSnapshot = versions[versions.length - 1]?.snapshot;

    expect(ticket?.status).toBe(TicketStatus.DONE);
    expect(versions).toHaveLength(2);
    expect(latestSnapshot?.status).toBe(TicketStatus.DONE);
    expect(latestSnapshot?.closedReason).toBe("No longer needed");

    expect(result.closedTickets).toEqual([
      {
        ticketId: "ticket-close",
        title: "Close me",
        diffs: [
          {
            field: "status",
            before: TicketStatus.TODO,
            after: TicketStatus.DONE,
          },
        ],
      },
    ]);
  });

  it("rejects unknown ticket ids without crashing", async () => {
    const state = createState();
    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const plan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: "missing-ticket",
          title: "new",
          reason: "unknown id",
        },
      ],
      closeTickets: [],
      rationale: "Handle unknown ticket id.",
    });

    const result = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan,
    });

    expect(result.rejectedChanges).toEqual([
      {
        ticketId: "missing-ticket",
        action: "update",
        reason: "Ticket not found in project.",
      },
    ]);
    expect(state.events).toHaveLength(1);
  });

  it("preserves harness in TicketVersion snapshots across create and updates", async () => {
    const state = createState();
    const tx = buildTx(state);
    mockTransaction.mockImplementation(async (fn: (trx: ReturnType<typeof buildTx>) => unknown) =>
      fn(tx),
    );

    const createdHarness = makeHarness("created");
    const updatedHarness = makeHarness("updated");

    const createPlan = orchestratorOutputSchema.parse({
      createTickets: [
        {
          title: "Harness ticket",
          description: "Initial",
          priority: "MEDIUM",
          harness: createdHarness,
        },
      ],
      updateTickets: [],
      closeTickets: [],
      rationale: "Create with harness",
    });

    const createResult = await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan: createPlan,
    });

    const ticketId = createResult.createdTickets[0]?.ticketId;
    expect(ticketId).toBeDefined();

    const updateWithHarnessPlan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: ticketId!,
          title: "Harness ticket updated",
          harness: updatedHarness,
          reason: "Update harness",
        },
      ],
      closeTickets: [],
      rationale: "Update harness",
    });

    await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan: updateWithHarnessPlan,
    });

    const updateWithoutHarnessPlan = orchestratorOutputSchema.parse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: ticketId!,
          description: "Description changed only",
          reason: "No harness update",
        },
      ],
      closeTickets: [],
      rationale: "Preserve previous harness",
    });

    await applyOrchestratorPlan({
      projectId: "project-1",
      userId: "user-1",
      plan: updateWithoutHarnessPlan,
    });

    const versions = state.ticketVersions
      .filter((item) => item.ticketId === ticketId)
      .sort((left, right) => left.version - right.version);

    expect(versions).toHaveLength(3);
    expect(versions[0]?.snapshot.harness).toEqual(createdHarness);
    expect(versions[1]?.snapshot.harness).toEqual(updatedHarness);
    expect(versions[2]?.snapshot.harness).toEqual(updatedHarness);
  });

  it("does not open an apply transaction when orchestrator output fails schema validation", () => {
    const invalidOutput = {
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket-1",
          status: "DOING",
          reason: "Invalid status should fail schema validation.",
        },
      ],
      closeTickets: [],
      rationale: "Invalid model output.",
    };

    expect(() => orchestratorOutputSchema.parse(invalidOutput)).toThrow();
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
