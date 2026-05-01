import { RunStatus, RunType, TicketPriority, TicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAgentFindFirst, mockEventCreate, mockRunCreate, mockRunUpdate, mockTicketFindFirst } =
  vi.hoisted(() => ({
    mockAgentFindFirst: vi.fn(),
    mockEventCreate: vi.fn(),
    mockRunCreate: vi.fn(),
    mockRunUpdate: vi.fn(),
    mockTicketFindFirst: vi.fn(),
  }));

vi.mock("../db", () => ({
  db: {
    ticket: {
      findFirst: mockTicketFindFirst,
    },
    agent: {
      findFirst: mockAgentFindFirst,
    },
    run: {
      create: mockRunCreate,
      update: mockRunUpdate,
    },
    event: {
      create: mockEventCreate,
    },
  },
}));

import { LLMRateLimitError, type LLMClient } from "../llm";
import { AgentRunInvalidOutputError, AgentRunTicketNotFoundError } from "./errors";
import { runTicketAgentCore } from "./run-ticket-agent-core";

function makeOwnedTicket() {
  const now = new Date("2026-05-01T00:00:00.000Z");

  return {
    id: "ticket-1",
    projectId: "project-1",
    title: "Build execution endpoint",
    description: "Implement agent execution endpoint.",
    status: TicketStatus.TODO,
    priority: TicketPriority.HIGH,
    currentVersionId: "version-1",
    createdAt: now,
    updatedAt: now,
    project: {
      id: "project-1",
      name: "AI Agile MVP",
      description: "Project description",
    },
    currentVersion: {
      id: "version-1",
      ticketId: "ticket-1",
      version: 3,
      snapshot: {
        harness: {
          goal: "Ship endpoint",
          acceptance_checks: ["Returns valid JSON"],
        },
      },
      createdAt: now,
    },
  };
}

function makeRun(
  status: RunStatus,
  input: {
    finishedAt?: Date | null;
    agentId?: string | null;
  } = {},
) {
  return {
    id: "run-1",
    type: RunType.EXECUTION,
    status,
    projectId: "project-1",
    ticketId: "ticket-1",
    agentId: "agentId" in input ? (input.agentId ?? null) : "agent-1",
    startedAt: new Date("2026-05-01T00:00:00.000Z"),
    finishedAt: input.finishedAt ?? null,
  };
}

function makePlannerOutput() {
  return {
    schemaVersion: 1 as const,
    role: "PLANNER" as const,
    summary: "Planning output summary",
    status: "COMPLETED" as const,
    findings: ["Found key dependency"],
    risks: ["Potential scope drift"],
    suggestedNextSteps: ["Lock scope for sprint"],
    replanSignal: {
      shouldReplan: false,
      severity: "LOW" as const,
    },
    planningNotes: ["Implement auth before orchestration"],
    dependencyNotes: ["LLM gateway is required"],
    scopeConcerns: ["Potentially broad ticket scope"],
    acceptanceCriteriaSuggestions: ["Add endpoint contract tests"],
  };
}

function makeQaOutput() {
  return {
    schemaVersion: 1 as const,
    role: "QA" as const,
    summary: "QA output summary",
    status: "COMPLETED" as const,
    findings: ["Found regression risk in update path"],
    risks: ["Retry behavior could break"],
    suggestedNextSteps: ["Add regression coverage"],
    replanSignal: {
      shouldReplan: false,
      severity: "LOW" as const,
    },
    testPlan: ["Run route tests"],
    edgeCases: ["Invalid payload shape"],
    regressionRisks: ["Status transition regressions"],
    acceptanceCheckResults: [
      {
        check: "PATCH route keeps 409 behavior",
        result: "PASS" as const,
      },
    ],
  };
}

function makeLLMClientResolved(object: unknown) {
  const generateJSONMock = vi.fn().mockResolvedValue({
    object,
    rawText: JSON.stringify(object),
    provider: "openai",
    model: "test-model",
    attempts: 1,
    retryCount: 0,
  });

  return {
    llmClient: {
      generateJSON: generateJSONMock,
    } as unknown as LLMClient,
    generateJSONMock,
  };
}

describe("runTicketAgentCore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTicketFindFirst.mockResolvedValue(makeOwnedTicket());
    mockAgentFindFirst.mockResolvedValue({ id: "agent-1" });
    mockRunCreate.mockResolvedValue(makeRun(RunStatus.RUNNING));
    mockRunUpdate.mockImplementation(async (args: { data: { status: RunStatus } }) =>
      makeRun(args.data.status, {
        finishedAt: new Date("2026-05-01T00:05:00.000Z"),
      }),
    );
  });

  it("creates a RUNNING run, calls LLM, parses output, and marks run SUCCEEDED", async () => {
    const { llmClient, generateJSONMock } = makeLLMClientResolved(makePlannerOutput());

    const result = await runTicketAgentCore({
      ticketId: "ticket-1",
      userId: "user-1",
      role: "PLANNER",
      instruction: "Prioritize dependency analysis.",
      llmClient,
    });

    expect(mockRunCreate).toHaveBeenCalledWith({
      data: {
        type: RunType.EXECUTION,
        status: RunStatus.RUNNING,
        projectId: "project-1",
        ticketId: "ticket-1",
        agentId: "agent-1",
      },
      select: expect.any(Object),
    });
    expect(generateJSONMock).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: expect.any(Object),
        meta: expect.objectContaining({
          userId: "user-1",
          projectId: "project-1",
          runId: "run-1",
          purpose: "agent.run-ticket",
        }),
      }),
    );

    const runCreateCallOrder = mockRunCreate.mock.invocationCallOrder[0];
    const llmCallOrder = generateJSONMock.mock.invocationCallOrder[0];
    expect(runCreateCallOrder).toBeDefined();
    expect(llmCallOrder).toBeDefined();
    expect(runCreateCallOrder ?? 0).toBeLessThan(llmCallOrder ?? 0);

    const llmCall = generateJSONMock.mock.calls.at(-1)?.[0];
    const llmContext = llmCall ? JSON.parse(llmCall.user as string) : null;
    expect(llmContext?.ticket?.harness).toEqual(
      expect.objectContaining({
        goal: "Ship endpoint",
      }),
    );

    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.SUCCEEDED,
      }),
      select: expect.any(Object),
    });
    expect(result.run.status).toBe(RunStatus.SUCCEEDED);
    expect(result.agentOutput.role).toBe("PLANNER");
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("marks run FAILED and throws a safe error when output is invalid", async () => {
    const { llmClient } = makeLLMClientResolved({
      role: "PLANNER",
      summary: "Missing required fields should fail parsing",
    });

    await expect(
      runTicketAgentCore({
        ticketId: "ticket-1",
        userId: "user-1",
        role: "PLANNER",
        llmClient,
      }),
    ).rejects.toBeInstanceOf(AgentRunInvalidOutputError);

    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.FAILED,
      }),
      select: expect.any(Object),
    });
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("marks run FAILED and rethrows LLM errors", async () => {
    const llmError = new LLMRateLimitError({
      identifier: "user:user-1",
      limit: 5,
      remaining: 0,
      reset: Date.now() + 10_000,
      retryAfterSeconds: 10,
    });
    const generateJSONMock = vi.fn().mockRejectedValue(llmError);
    const llmClient = {
      generateJSON: generateJSONMock,
    } as unknown as LLMClient;

    await expect(
      runTicketAgentCore({
        ticketId: "ticket-1",
        userId: "user-1",
        role: "PLANNER",
        llmClient,
      }),
    ).rejects.toBe(llmError);

    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.FAILED,
      }),
      select: expect.any(Object),
    });
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("rejects mismatched output role and marks run FAILED", async () => {
    const { llmClient } = makeLLMClientResolved(makeQaOutput());

    await expect(
      runTicketAgentCore({
        ticketId: "ticket-1",
        userId: "user-1",
        role: "IMPLEMENTER",
        llmClient,
      }),
    ).rejects.toBeInstanceOf(AgentRunInvalidOutputError);

    expect(mockRunUpdate).toHaveBeenLastCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.FAILED,
      }),
      select: expect.any(Object),
    });
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("continues when no matching Agent row exists and uses agentId null", async () => {
    mockAgentFindFirst.mockResolvedValueOnce(null);
    mockRunCreate.mockResolvedValueOnce(
      makeRun(RunStatus.RUNNING, {
        agentId: null,
      }),
    );
    mockRunUpdate.mockImplementationOnce(async (args: { data: { status: RunStatus } }) =>
      makeRun(args.data.status, {
        finishedAt: new Date("2026-05-01T00:05:00.000Z"),
        agentId: null,
      }),
    );
    const { llmClient, generateJSONMock } = makeLLMClientResolved(makePlannerOutput());

    const result = await runTicketAgentCore({
      ticketId: "ticket-1",
      userId: "user-1",
      role: "PLANNER",
      llmClient,
    });

    expect(mockRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        agentId: null,
      }),
      select: expect.any(Object),
    });
    expect(generateJSONMock).toHaveBeenCalled();
    expect(result.run.status).toBe(RunStatus.SUCCEEDED);
    expect(result.run.agentId).toBeNull();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("preserves the original business error when FAILED finalization fails", async () => {
    const llmError = new LLMRateLimitError({
      identifier: "user:user-1",
      limit: 5,
      remaining: 0,
      reset: Date.now() + 10_000,
      retryAfterSeconds: 10,
    });
    const llmClient = {
      generateJSON: vi.fn().mockRejectedValue(llmError),
    } as unknown as LLMClient;
    mockRunUpdate.mockRejectedValueOnce(new Error("failed to mark run as FAILED"));

    await expect(
      runTicketAgentCore({
        ticketId: "ticket-1",
        userId: "user-1",
        role: "PLANNER",
        llmClient,
      }),
    ).rejects.toBe(llmError);

    expect(mockRunUpdate).toHaveBeenCalledWith({
      where: {
        id: "run-1",
      },
      data: expect.objectContaining({
        status: RunStatus.FAILED,
      }),
      select: expect.any(Object),
    });
    expect(mockEventCreate).not.toHaveBeenCalled();
  });

  it("fails with not-found error when ticket is not owned", async () => {
    mockTicketFindFirst.mockResolvedValueOnce(null);
    const { llmClient } = makeLLMClientResolved(makePlannerOutput());

    await expect(
      runTicketAgentCore({
        ticketId: "ticket-1",
        userId: "user-1",
        role: "PLANNER",
        llmClient,
      }),
    ).rejects.toBeInstanceOf(AgentRunTicketNotFoundError);

    expect(mockRunCreate).not.toHaveBeenCalled();
  });
});
