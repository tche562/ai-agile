import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertProjectOwnership, mockGeneratePlan, mockLlmErrorToResponse } = vi.hoisted(() => ({
  mockAssertProjectOwnership: vi.fn(),
  mockGeneratePlan: vi.fn(),
  mockLlmErrorToResponse: vi.fn(),
}));

vi.mock("@/server/projects/assert-project-ownership", () => ({
  assertProjectOwnership: mockAssertProjectOwnership,
}));

vi.mock("@/server/llm", () => ({
  llmErrorToResponse: mockLlmErrorToResponse,
}));

vi.mock("@/server/orchestrator", () => {
  class MockGeneratePlanAlreadyExistsError extends Error {
    constructor() {
      super("Generate Plan can only run for projects without existing tickets.");
      this.name = "GeneratePlanAlreadyExistsError";
    }
  }

  class MockOrchestratorInvalidOutputError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "OrchestratorInvalidOutputError";
    }
  }

  return {
    generatePlan: mockGeneratePlan,
    GeneratePlanAlreadyExistsError: MockGeneratePlanAlreadyExistsError,
    OrchestratorInvalidOutputError: MockOrchestratorInvalidOutputError,
  };
});

import { POST } from "./route";
import {
  GeneratePlanAlreadyExistsError,
  OrchestratorInvalidOutputError,
} from "@/server/orchestrator";

describe("POST /api/projects/[projectId]/orchestrator/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectOwnership.mockResolvedValue({
      currentUser: { id: "user-1" },
      project: { id: "project-1" },
    });
    mockLlmErrorToResponse.mockReturnValue(null);
  });

  it("returns generated plan result for owned project", async () => {
    mockGeneratePlan.mockResolvedValue({
      runId: "run-1",
      createdTickets: [{ ticketId: "ticket-1", title: "Initial ticket" }],
      updatedTickets: [],
      closedTickets: [],
      rejectedChanges: [],
      rationale: "Initial planning rationale.",
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/generate"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(mockGeneratePlan).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        runId: "run-1",
        createdTickets: [{ ticketId: "ticket-1", title: "Initial ticket" }],
      }),
    );
  });

  it("returns 404 when project is not owned or not found", async () => {
    mockAssertProjectOwnership.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/generate"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mockGeneratePlan).not.toHaveBeenCalled();
  });

  it("returns 409 when project already has tickets", async () => {
    mockGeneratePlan.mockRejectedValue(new GeneratePlanAlreadyExistsError());

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/generate"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Generate Plan can only run for projects without existing tickets",
    });
  });

  it("uses llm error mapper response when available", async () => {
    const mappedResponse = new Response(JSON.stringify({ error: "Daily LLM quota exceeded" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
    mockGeneratePlan.mockRejectedValue(new Error("quota"));
    mockLlmErrorToResponse.mockReturnValue(mappedResponse);

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/generate"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Daily LLM quota exceeded" });
  });

  it("returns 502 for invalid orchestrator output", async () => {
    mockGeneratePlan.mockRejectedValue(new OrchestratorInvalidOutputError("invalid output"));

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/generate"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Invalid orchestrator output" });
  });
});
