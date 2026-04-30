import { RunStatus, RunType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockApplyOrchestratorPlan,
  mockEventFindMany,
  mockProjectFindFirst,
  mockRunCreate,
  mockRunUpdate,
  mockTicketFindMany,
} = vi.hoisted(() => ({
  mockApplyOrchestratorPlan: vi.fn(),
  mockEventFindMany: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockRunCreate: vi.fn(),
  mockRunUpdate: vi.fn(),
  mockTicketFindMany: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: {
    project: {
      findFirst: mockProjectFindFirst,
    },
    run: {
      create: mockRunCreate,
      update: mockRunUpdate,
    },
    ticket: {
      findMany: mockTicketFindMany,
    },
    event: {
      findMany: mockEventFindMany,
    },
  },
}));

vi.mock("../apply-engine", () => ({
  applyOrchestratorPlan: mockApplyOrchestratorPlan,
}));

import {
  generatePlan,
  GeneratePlanAlreadyExistsError,
  OrchestratorInvalidOutputError,
  replanProject,
} from "../service";
import type { LLMClient } from "../../llm";
import type { OrchestratorOutput, TicketHarness } from "../schemas";

function makeHarness(label: string): TicketHarness {
  return {
    goal: `${label} goal with a concrete implementation outcome`,
    inputs: [`${label} project context`, `${label} relevant APIs`],
    output_format: [`${label} backend behavior`, `${label} persisted data changes`],
    acceptance_checks: [`${label} can be verified by a user`],
    non_goals: [`${label} does not include unrelated UI polish`],
    risks: [`${label} may fail on invalid input`],
    test_ideas: [`${label} unit test`, `${label} smoke test`],
  };
}

function makeCreateTicket(index: number) {
  return {
    title: `Ticket ${index}`,
    description: `Implement focused work unit ${index}.`,
    priority: "HIGH" as const,
    harness: makeHarness(`ticket-${index}`),
  };
}

function makeValidPlan(): OrchestratorOutput {
  return {
    createTickets: Array.from({ length: 8 }, (_, index) => makeCreateTicket(index + 1)),
    updateTickets: [],
    closeTickets: [],
    rationale: "Generate a logical initial MVP plan.",
  };
}

function makeLLMClient(object: unknown): LLMClient {
  return {
    generateJSON: vi.fn().mockResolvedValue({
      object,
      rawText: JSON.stringify(object),
      provider: "openai",
      model: "test-model",
      attempts: 1,
      retryCount: 0,
    }),
  };
}

describe("generatePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFindFirst.mockResolvedValue({
      id: "project-1",
      name: "AI Agile MVP",
      description: "Build an AI agile project management system.",
      _count: {
        tickets: 0,
      },
    });
    mockRunCreate.mockResolvedValue({
      id: "run-1",
      projectId: "project-1",
      type: RunType.PLANNING,
      status: RunStatus.PENDING,
    });
    mockRunUpdate.mockResolvedValue({});
    mockApplyOrchestratorPlan.mockResolvedValue({
      createdTickets: [{ ticketId: "ticket-1", title: "Ticket 1" }],
      updatedTickets: [],
      closedTickets: [],
      rejectedChanges: [],
      rationale: "Generate a logical initial MVP plan.",
    });
    mockTicketFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);
  });

  it("refuses to generate a plan when the project already has tickets", async () => {
    mockProjectFindFirst.mockResolvedValueOnce({
      id: "project-1",
      name: "AI Agile MVP",
      description: "Build an AI agile project management system.",
      _count: {
        tickets: 1,
      },
    });

    await expect(
      generatePlan({
        projectId: "project-1",
        userId: "user-1",
        llmClient: makeLLMClient(makeValidPlan()),
      }),
    ).rejects.toBeInstanceOf(GeneratePlanAlreadyExistsError);

    expect(mockRunCreate).not.toHaveBeenCalled();
    expect(mockApplyOrchestratorPlan).not.toHaveBeenCalled();
  });

  it("calls the LLM Gateway and applies a valid generate-plan output", async () => {
    const plan = makeValidPlan();
    const llmClient = makeLLMClient(plan);

    const result = await generatePlan({
      projectId: "project-1",
      userId: "user-1",
      llmClient,
    });

    expect(mockRunCreate).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        type: RunType.PLANNING,
      },
    });
    expect(llmClient.generateJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.any(Object),
        meta: expect.objectContaining({
          userId: "user-1",
          projectId: "project-1",
          runId: "run-1",
          purpose: "orchestrator.generate-plan",
        }),
      }),
    );
    expect(mockApplyOrchestratorPlan).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-1",
      plan,
    });
    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.SUCCEEDED,
      }),
    });
    expect(result?.createdTickets).toEqual([{ ticketId: "ticket-1", title: "Ticket 1" }]);
  });

  it("rejects invalid priority values before applying", async () => {
    const invalidPlan = makeValidPlan() as unknown as Record<string, unknown>;
    invalidPlan["createTickets"] = [{ ...makeCreateTicket(1), priority: "P0" }];

    await expect(
      generatePlan({
        projectId: "project-1",
        userId: "user-1",
        llmClient: makeLLMClient(invalidPlan),
      }),
    ).rejects.toThrowError();

    expect(mockApplyOrchestratorPlan).not.toHaveBeenCalled();
    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.FAILED,
      }),
    });
  });

  it("rejects attempts to set ticket status before applying", async () => {
    const invalidPlan = makeValidPlan() as unknown as Record<string, unknown>;
    invalidPlan["createTickets"] = [{ ...makeCreateTicket(1), status: "BACKLOG" }];

    await expect(
      generatePlan({
        projectId: "project-1",
        userId: "user-1",
        llmClient: makeLLMClient(invalidPlan),
      }),
    ).rejects.toThrowError();

    expect(mockApplyOrchestratorPlan).not.toHaveBeenCalled();
  });

  it("rejects incomplete generated harnesses before applying", async () => {
    const incompletePlan = makeValidPlan();
    incompletePlan.createTickets[0] = {
      ...makeCreateTicket(1),
      harness: {
        ...makeHarness("incomplete"),
        risks: [],
      },
    };

    await expect(
      generatePlan({
        projectId: "project-1",
        userId: "user-1",
        llmClient: makeLLMClient(incompletePlan),
      }),
    ).rejects.toBeInstanceOf(OrchestratorInvalidOutputError);

    expect(mockApplyOrchestratorPlan).not.toHaveBeenCalled();
  });
});

describe("replanProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjectFindFirst.mockResolvedValue({
      id: "project-1",
      name: "AI Agile MVP",
      description: "Build an AI agile project management system.",
    });
    mockTicketFindMany.mockResolvedValue([
      {
        id: "ticket-1",
        title: "Build project dashboard",
        description: "Create the dashboard.",
        status: "BACKLOG",
        priority: "HIGH",
        currentVersion: {
          snapshot: {
            harness: makeHarness("existing-ticket"),
          },
        },
      },
      {
        id: "ticket-done",
        title: "Completed auth",
        description: "Auth is already complete.",
        status: "DONE",
        priority: "CRITICAL",
        currentVersion: null,
      },
    ]);
    mockEventFindMany.mockResolvedValue([
      {
        id: "event-1",
        type: "SCOPE_CHANGED",
        ticketId: "ticket-1",
        createdAt: new Date("2026-04-30T00:00:00.000Z"),
        payload: {
          reason: "Dashboard now needs a timeline section.",
        },
      },
    ]);
    mockRunCreate.mockResolvedValue({
      id: "run-replan-1",
      projectId: "project-1",
      type: RunType.REPLAN,
      status: RunStatus.PENDING,
    });
    mockRunUpdate.mockResolvedValue({});
    mockApplyOrchestratorPlan.mockResolvedValue({
      createdTickets: [],
      updatedTickets: [{ ticketId: "ticket-1", title: "Build project dashboard", diffs: [] }],
      closedTickets: [],
      rejectedChanges: [],
      rationale: "Replan based on recent events.",
    });
  });

  it("loads tickets and recent events, calls the LLM Gateway, and applies a valid replan", async () => {
    const plan: OrchestratorOutput = {
      createTickets: [
        {
          title: "Add event timeline",
          description: "Implement a project event timeline for the dashboard.",
          priority: "HIGH",
          harness: makeHarness("timeline"),
        },
      ],
      updateTickets: [
        {
          ticketId: "ticket-1",
          description: "Update dashboard scope to include an event timeline.",
          reason: "Recent event changed dashboard scope.",
        },
      ],
      closeTickets: [],
      rationale: "Recent events require dashboard scope refinement.",
    };
    const llmClient = makeLLMClient(plan);

    const result = await replanProject({
      projectId: "project-1",
      userId: "user-1",
      llmClient,
      contextOptions: {
        recentEventLimit: 20,
        activeTicketLimit: 50,
      },
    });

    expect(mockTicketFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
      }),
    );
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 20,
      }),
    );
    expect(mockRunCreate).toHaveBeenCalledWith({
      data: {
        projectId: "project-1",
        type: RunType.REPLAN,
      },
    });
    expect(llmClient.generateJSON).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          userId: "user-1",
          projectId: "project-1",
          runId: "run-replan-1",
          purpose: "orchestrator.replan",
        }),
      }),
    );
    expect(mockApplyOrchestratorPlan).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-replan-1",
      plan,
    });
    expect(result?.updatedTickets).toEqual([
      { ticketId: "ticket-1", title: "Build project dashboard", diffs: [] },
    ]);
  });

  it("lets the apply engine reject immutable ticket changes instead of duplicating that logic", async () => {
    const plan: OrchestratorOutput = {
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket-done",
          description: "Try to mutate done ticket.",
          reason: "The model should not do this, but the apply engine must enforce it.",
        },
      ],
      closeTickets: [],
      rationale: "The apply engine should reject this immutable ticket update.",
    };
    mockApplyOrchestratorPlan.mockResolvedValueOnce({
      createdTickets: [],
      updatedTickets: [],
      closedTickets: [],
      rejectedChanges: [
        {
          ticketId: "ticket-done",
          action: "update",
          reason: "Ticket status is not mutable.",
        },
      ],
      rationale: plan.rationale,
    });

    const result = await replanProject({
      projectId: "project-1",
      userId: "user-1",
      llmClient: makeLLMClient(plan),
    });

    expect(mockApplyOrchestratorPlan).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      runId: "run-replan-1",
      plan,
    });
    expect(result?.rejectedChanges).toEqual([
      {
        ticketId: "ticket-done",
        action: "update",
        reason: "Ticket status is not mutable.",
      },
    ]);
  });

  it("rejects incomplete harnesses in created replan tickets before applying", async () => {
    const plan: OrchestratorOutput = {
      createTickets: [
        {
          title: "Follow-up work",
          description: "Create a follow-up ticket.",
          priority: "MEDIUM",
          harness: {
            ...makeHarness("follow-up"),
            acceptance_checks: [],
          },
        },
      ],
      updateTickets: [],
      closeTickets: [],
      rationale: "Recent events require follow-up work.",
    };

    await expect(
      replanProject({
        projectId: "project-1",
        userId: "user-1",
        llmClient: makeLLMClient(plan),
      }),
    ).rejects.toBeInstanceOf(OrchestratorInvalidOutputError);

    expect(mockApplyOrchestratorPlan).not.toHaveBeenCalled();
    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-replan-1",
      },
      data: expect.objectContaining({
        status: RunStatus.FAILED,
      }),
    });
  });
});
