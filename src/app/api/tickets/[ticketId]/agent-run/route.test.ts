import { EventType, RunStatus, RunType, TicketPriority, TicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  MockAgentRunInvalidOutputError,
  MockAgentRunTicketNotFoundError,
  mockCreateValidatedEvent,
  mockGetServerSession,
  mockLogRuntimeError,
  mockLlmErrorToResponse,
  mockRunTicketAgentCore,
  mockUserUpsert,
} = vi.hoisted(() => ({
  MockAgentRunInvalidOutputError: class MockAgentRunInvalidOutputError extends Error {
    constructor() {
      super("Invalid agent output.");
      this.name = "AgentRunInvalidOutputError";
    }
  },
  MockAgentRunTicketNotFoundError: class MockAgentRunTicketNotFoundError extends Error {
    constructor() {
      super("Ticket not found.");
      this.name = "AgentRunTicketNotFoundError";
    }
  },
  mockCreateValidatedEvent: vi.fn(),
  mockGetServerSession: vi.fn(),
  mockLogRuntimeError: vi.fn(),
  mockLlmErrorToResponse: vi.fn(),
  mockRunTicketAgentCore: vi.fn(),
  mockUserUpsert: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/auth", () => ({
  authOptions: {},
}));

vi.mock("@/server/db", () => ({
  db: {
    user: {
      upsert: mockUserUpsert,
    },
  },
}));

vi.mock("@/server/agents/run-ticket-agent-core", () => ({
  runTicketAgentCore: mockRunTicketAgentCore,
}));

vi.mock("@/server/agents/errors", () => ({
  AgentRunInvalidOutputError: MockAgentRunInvalidOutputError,
  AgentRunTicketNotFoundError: MockAgentRunTicketNotFoundError,
}));

vi.mock("@/server/events/service", () => ({
  createValidatedEvent: mockCreateValidatedEvent,
}));

vi.mock("@/server/llm", () => ({
  llmErrorToResponse: mockLlmErrorToResponse,
}));

vi.mock("@/server/observability/logger", () => ({
  logRuntimeError: mockLogRuntimeError,
}));

import { AgentRunInvalidOutputError, AgentRunTicketNotFoundError } from "@/server/agents/errors";
import { POST } from "./route";

function makeRunResult() {
  return {
    run: {
      id: "run-1",
      type: RunType.EXECUTION,
      status: RunStatus.SUCCEEDED,
      projectId: "project-1",
      ticketId: "ticket-1",
      agentId: "agent-1",
      startedAt: new Date("2026-05-02T00:00:00.000Z"),
      finishedAt: new Date("2026-05-02T00:05:00.000Z"),
    },
    ticket: {
      id: "ticket-1",
      projectId: "project-1",
      title: "Build agent-run API",
      description: "Implement agent execution route.",
      status: TicketStatus.TODO,
      priority: TicketPriority.HIGH,
      currentVersionId: "version-1",
      currentVersionNumber: 1,
      harness: {
        goal: "Ship route",
      },
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
    },
    agentOutput: {
      schemaVersion: 1 as const,
      role: "IMPLEMENTER" as const,
      summary: "Implemented endpoint and tests.",
      status: "COMPLETED" as const,
      findings: ["Route wiring works"],
      risks: ["Potential auth edge cases"],
      suggestedNextSteps: ["Add integration coverage"],
      replanSignal: {
        shouldReplan: false,
        severity: "LOW" as const,
      },
      implementationPlan: ["Add route", "Map errors"],
      touchedAreas: ["src/app/api/tickets/[ticketId]/agent-run"],
      technicalRisks: ["Error mapping regressions"],
      testSuggestions: ["Add route unit tests"],
    },
  };
}

describe("POST /api/tickets/[ticketId]/agent-run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: {
        email: "owner.a@ai-agile.local",
        name: "Owner A",
      },
    });
    mockUserUpsert.mockResolvedValue({
      id: "user-1",
      email: "owner.a@ai-agile.local",
      name: "Owner A",
    });
    mockRunTicketAgentCore.mockResolvedValue(makeRunResult());
    mockCreateValidatedEvent.mockResolvedValue({
      id: "event-1",
      type: EventType.WORKLOG_ADDED,
      projectId: "project-1",
      ticketId: "ticket-1",
      createdAt: new Date("2026-05-02T00:06:00.000Z"),
    });
    mockLlmErrorToResponse.mockReturnValue(null);
  });

  it("runs agent core and writes one structured WORKLOG_ADDED event", async () => {
    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "IMPLEMENTER",
          instruction: "Focus on reliable error mapping.",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(200);
    expect(mockRunTicketAgentCore).toHaveBeenCalledWith({
      ticketId: "ticket-1",
      userId: "user-1",
      role: "IMPLEMENTER",
      instruction: "Focus on reliable error mapping.",
    });
    expect(mockCreateValidatedEvent).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        type: EventType.WORKLOG_ADDED,
        projectId: "project-1",
        ticketId: "ticket-1",
        payload: expect.objectContaining({
          schemaVersion: 1,
          runId: "run-1",
          ticketId: "ticket-1",
          agentRole: "IMPLEMENTER",
          summary: "Implemented endpoint and tests.",
          status: "COMPLETED",
          findings: ["Route wiring works"],
          risks: ["Potential auth edge cases"],
          suggestedNextSteps: ["Add integration coverage"],
          replanSignal: {
            shouldReplan: false,
            severity: "LOW",
          },
          roleSpecificOutput: {
            implementationPlan: ["Add route", "Map errors"],
            touchedAreas: ["src/app/api/tickets/[ticketId]/agent-run"],
            technicalRisks: ["Error mapping regressions"],
            testSuggestions: ["Add route unit tests"],
          },
        }),
      }),
    );

    const createEventCall = mockCreateValidatedEvent.mock.calls.at(-1)?.[1] as {
      payload: Record<string, unknown>;
    };
    expect(createEventCall.payload).not.toHaveProperty("rawText");

    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        run: expect.objectContaining({
          id: "run-1",
          status: RunStatus.SUCCEEDED,
        }),
        worklog: expect.objectContaining({
          agentRole: "IMPLEMENTER",
          roleSpecificOutput: expect.objectContaining({
            implementationPlan: ["Add route", "Map errors"],
          }),
        }),
        event: expect.objectContaining({
          id: "event-1",
          type: EventType.WORKLOG_ADDED,
          projectId: "project-1",
          ticketId: "ticket-1",
          createdAt: "2026-05-02T00:06:00.000Z",
        }),
      }),
    );
  });

  it("returns 401 for unauthenticated request", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "PLANNER",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(401);
    expect(mockRunTicketAgentCore).not.toHaveBeenCalled();
    expect(mockCreateValidatedEvent).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "PM",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid agent run payload" });
    expect(mockRunTicketAgentCore).not.toHaveBeenCalled();
    expect(mockCreateValidatedEvent).not.toHaveBeenCalled();
  });

  it("returns 404 for non-owned or missing ticket", async () => {
    mockRunTicketAgentCore.mockRejectedValueOnce(new AgentRunTicketNotFoundError());

    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "QA",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mockCreateValidatedEvent).not.toHaveBeenCalled();
  });

  it("returns 502 when agent output is invalid", async () => {
    mockRunTicketAgentCore.mockRejectedValueOnce(new AgentRunInvalidOutputError());

    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "QA",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Invalid agent output" });
    expect(mockCreateValidatedEvent).not.toHaveBeenCalled();
  });

  it("returns 502 with runId for invalid agent output when available", async () => {
    const invalidOutputError = Object.assign(new AgentRunInvalidOutputError(), {
      runId: "run-invalid-1",
      stack: "sensitive stack trace",
      rawOutput: "sensitive provider output",
      prompt: "sensitive prompt",
      validationDetails: "sensitive validation internals",
    });
    mockRunTicketAgentCore.mockRejectedValueOnce(invalidOutputError);

    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "QA",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(502);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toEqual({
      error: "Invalid agent output",
      runId: "run-invalid-1",
    });
    expect(body).not.toHaveProperty("stack");
    expect(body).not.toHaveProperty("rawOutput");
    expect(body).not.toHaveProperty("prompt");
    expect(body).not.toHaveProperty("validationDetails");
    expect(mockCreateValidatedEvent).not.toHaveBeenCalled();
  });

  it("returns 429 when llm error mapper provides a quota/rate-limit response", async () => {
    const llmFailure = new Error("quota exceeded");
    const mappedResponse = new Response(JSON.stringify({ error: "Daily LLM quota exceeded" }), {
      status: 429,
      headers: {
        "content-type": "application/json",
      },
    });
    mockRunTicketAgentCore.mockRejectedValueOnce(llmFailure);
    mockLlmErrorToResponse.mockReturnValueOnce(mappedResponse);

    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "PLANNER",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Daily LLM quota exceeded" });
    expect(mockCreateValidatedEvent).not.toHaveBeenCalled();
    expect(mockLlmErrorToResponse).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        route: "POST /api/tickets/[ticketId]/agent-run",
        operation: "agent.run_ticket",
      }),
    );
  });

  it("returns runId in 500 payload when upstream error carries runId", async () => {
    const error = Object.assign(new Error("unexpected"), {
      runId: "run-99",
    });
    mockRunTicketAgentCore.mockRejectedValueOnce(error);

    const response = await POST(
      new Request("http://localhost/api/tickets/ticket-1/agent-run", {
        method: "POST",
        body: JSON.stringify({
          role: "PLANNER",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Agent run failed",
      runId: "run-99",
    });
  });
});
