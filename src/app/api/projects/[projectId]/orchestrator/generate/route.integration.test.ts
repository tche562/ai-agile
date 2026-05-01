import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockApplyOrchestratorPlan,
  mockAssertProjectOwnership,
  mockCreateLLMClient,
  mockEventCreate,
  mockLlmErrorToResponse,
  mockProjectFindFirst,
  mockRunCreate,
  mockRunUpdate,
  mockTicketCreate,
  mockTicketUpdate,
  mockTicketVersionCreate,
} = vi.hoisted(() => ({
  mockApplyOrchestratorPlan: vi.fn(),
  mockAssertProjectOwnership: vi.fn(),
  mockCreateLLMClient: vi.fn(),
  mockEventCreate: vi.fn(),
  mockLlmErrorToResponse: vi.fn(),
  mockProjectFindFirst: vi.fn(),
  mockRunCreate: vi.fn(),
  mockRunUpdate: vi.fn(),
  mockTicketCreate: vi.fn(),
  mockTicketUpdate: vi.fn(),
  mockTicketVersionCreate: vi.fn(),
}));

vi.mock("@/server/projects/assert-project-ownership", () => ({
  assertProjectOwnership: mockAssertProjectOwnership,
}));

vi.mock("@/server/db", () => ({
  db: {
    project: {
      findFirst: mockProjectFindFirst,
    },
    run: {
      create: mockRunCreate,
      update: mockRunUpdate,
    },
    ticket: {
      create: mockTicketCreate,
      update: mockTicketUpdate,
    },
    ticketVersion: {
      create: mockTicketVersionCreate,
    },
    event: {
      create: mockEventCreate,
    },
  },
}));

vi.mock("../../../../../../server/db", () => ({
  db: {
    project: {
      findFirst: mockProjectFindFirst,
    },
    run: {
      create: mockRunCreate,
      update: mockRunUpdate,
    },
    ticket: {
      create: mockTicketCreate,
      update: mockTicketUpdate,
    },
    ticketVersion: {
      create: mockTicketVersionCreate,
    },
    event: {
      create: mockEventCreate,
    },
  },
}));

vi.mock("@/server/orchestrator/apply-engine", () => ({
  applyOrchestratorPlan: mockApplyOrchestratorPlan,
}));
vi.mock("../../../../../../server/orchestrator/apply-engine", () => ({
  applyOrchestratorPlan: mockApplyOrchestratorPlan,
}));

vi.mock("@/server/llm", () => ({
  createLLMClient: mockCreateLLMClient,
  llmErrorToResponse: mockLlmErrorToResponse,
}));
vi.mock("../../../../../../server/llm", () => ({
  createLLMClient: mockCreateLLMClient,
  llmErrorToResponse: mockLlmErrorToResponse,
}));

vi.mock("@/server/orchestrator", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../../../server/orchestrator/service")
  >("../../../../../../server/orchestrator/service");

  return actual;
});

import { POST } from "./route";

describe("POST /api/projects/[projectId]/orchestrator/generate integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAssertProjectOwnership.mockResolvedValue({
      currentUser: { id: "user-1" },
      project: { id: "project-1" },
    });
    mockLlmErrorToResponse.mockReturnValue(null);
  });

  it("returns 409 and skips LLM/apply when project already has tickets", async () => {
    mockProjectFindFirst.mockResolvedValue({
      id: "project-1",
      name: "AI Agile MVP",
      description: "Project with existing work",
      _count: {
        tickets: 1,
      },
    });

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/orchestrator/generate", {
        method: "POST",
      }),
      { params: Promise.resolve({ projectId: "project-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Generate Plan can only run for projects without existing tickets",
    });

    // Critical safety assertions
    expect(mockCreateLLMClient).not.toHaveBeenCalled();
    expect(mockApplyOrchestratorPlan).not.toHaveBeenCalled();

    // No run lifecycle should start when generate-plan is rejected early.
    expect(mockRunCreate).not.toHaveBeenCalled();
    expect(mockRunUpdate).not.toHaveBeenCalled();

    // No direct ticket/event writes outside Apply Engine.
    expect(mockTicketCreate).not.toHaveBeenCalled();
    expect(mockTicketUpdate).not.toHaveBeenCalled();
    expect(mockTicketVersionCreate).not.toHaveBeenCalled();
    expect(mockEventCreate).not.toHaveBeenCalled();
  });
});
