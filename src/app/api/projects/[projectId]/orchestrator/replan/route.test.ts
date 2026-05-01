import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAssertProjectOwnership, mockLlmErrorToResponse, mockReplanProject } = vi.hoisted(
  () => ({
    mockAssertProjectOwnership: vi.fn(),
    mockLlmErrorToResponse: vi.fn(),
    mockReplanProject: vi.fn(),
  }),
);

vi.mock("@/server/projects/assert-project-ownership", () => ({
  assertProjectOwnership: mockAssertProjectOwnership,
}));

vi.mock("@/server/llm", () => ({
  llmErrorToResponse: mockLlmErrorToResponse,
}));

vi.mock("@/server/orchestrator", () => {
  class MockOrchestratorInvalidOutputError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "OrchestratorInvalidOutputError";
    }
  }

  return {
    replanProject: mockReplanProject,
    OrchestratorInvalidOutputError: MockOrchestratorInvalidOutputError,
  };
});

import { POST } from "./route";
import { OrchestratorInvalidOutputError } from "@/server/orchestrator";

describe("POST /api/projects/[projectId]/orchestrator/replan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectOwnership.mockResolvedValue({
      currentUser: { id: "user-1" },
      project: { id: "project-1" },
    });
    mockLlmErrorToResponse.mockReturnValue(null);
  });

  it("returns 400 for invalid json payload", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/replan", {
        method: "POST",
        body: "{invalid",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(mockReplanProject).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid replan options", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/replan", {
        method: "POST",
        body: JSON.stringify({ recentEventLimit: -1 }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid replan payload" });
    expect(mockReplanProject).not.toHaveBeenCalled();
  });

  it("calls orchestrator replan service with validated options", async () => {
    mockReplanProject.mockResolvedValue({
      runId: "run-1",
      createdTickets: [],
      updatedTickets: [],
      closedTickets: [],
      rejectedChanges: [],
      rationale: "Adjusted plan.",
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/replan", {
        method: "POST",
        body: JSON.stringify({ recentEventLimit: 20, activeTicketLimit: 50 }),
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(mockReplanProject).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "user-1",
      contextOptions: {
        recentEventLimit: 20,
        activeTicketLimit: 50,
      },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        runId: "run-1",
        rationale: "Adjusted plan.",
      }),
    );
  });

  it("returns 404 when project is not owned or not found", async () => {
    mockAssertProjectOwnership.mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/replan"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
    expect(mockReplanProject).not.toHaveBeenCalled();
  });

  it("maps llm quota/rate-limit failures to mapped response", async () => {
    const mappedResponse = new Response(JSON.stringify({ error: "LLM rate limit exceeded" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    });
    mockReplanProject.mockRejectedValue(new Error("rate-limit"));
    mockLlmErrorToResponse.mockReturnValue(mappedResponse);

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/replan"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "LLM rate limit exceeded" });
  });

  it("returns 502 for invalid orchestrator output", async () => {
    mockReplanProject.mockRejectedValue(new OrchestratorInvalidOutputError("invalid output"));

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/replan"),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "Invalid orchestrator output" });
  });
});
