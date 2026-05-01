import { TicketPriority, TicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertProjectOwnership,
  mockCreateTicketSchemaSafeParse,
  mockTransaction,
  mockTicketFindMany,
  mockTxTicketCreate,
  mockTxTicketVersionCreate,
  mockTxTicketUpdate,
} = vi.hoisted(() => ({
  mockAssertProjectOwnership: vi.fn(),
  mockCreateTicketSchemaSafeParse: vi.fn(),
  mockTransaction: vi.fn(),
  mockTicketFindMany: vi.fn(),
  mockTxTicketCreate: vi.fn(),
  mockTxTicketVersionCreate: vi.fn(),
  mockTxTicketUpdate: vi.fn(),
}));

vi.mock("@/server/projects/assert-project-ownership", () => ({
  assertProjectOwnership: mockAssertProjectOwnership,
}));

vi.mock("@/server/tickets/ticket.schemas", () => ({
  createTicketSchema: {
    safeParse: mockCreateTicketSchemaSafeParse,
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    $transaction: mockTransaction,
    ticket: {
      findMany: mockTicketFindMany,
    },
  },
}));

import { GET, POST } from "./route";

describe("tickets project route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAssertProjectOwnership.mockResolvedValue({
      currentUser: { id: "user-1" },
      project: { id: "project-1" },
    });
    mockCreateTicketSchemaSafeParse.mockImplementation((payload: unknown) => ({
      success: true,
      data: payload,
    }));
  });

  it("GET returns top-level harness from currentVersion snapshot", async () => {
    const now = new Date("2026-05-01T01:00:00.000Z");
    const harness = {
      goal: "Ship dashboard",
      acceptance_checks: ["Works"],
    };

    mockTicketFindMany.mockResolvedValue([
      {
        id: "ticket-1",
        projectId: "project-1",
        title: "Ticket 1",
        description: "desc",
        status: TicketStatus.BACKLOG,
        priority: TicketPriority.HIGH,
        currentVersionId: "version-1",
        createdAt: now,
        updatedAt: now,
        currentVersion: {
          id: "version-1",
          ticketId: "ticket-1",
          version: 2,
          snapshot: { harness },
          createdAt: now,
        },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/projects/project-1/tickets"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      expect.objectContaining({
        id: "ticket-1",
        harness,
        currentVersionId: "version-1",
        currentVersionNumber: 2,
      }),
    ]);
  });

  it("GET returns harness: null when harness is missing or version is missing", async () => {
    const now = new Date("2026-05-01T01:00:00.000Z");

    mockTicketFindMany.mockResolvedValue([
      {
        id: "ticket-no-harness",
        projectId: "project-1",
        title: "Ticket no harness",
        description: "desc",
        status: TicketStatus.BACKLOG,
        priority: TicketPriority.MEDIUM,
        currentVersionId: "version-2",
        createdAt: now,
        updatedAt: now,
        currentVersion: {
          id: "version-2",
          ticketId: "ticket-no-harness",
          version: 1,
          snapshot: { other: "value" },
          createdAt: now,
        },
      },
      {
        id: "ticket-no-version",
        projectId: "project-1",
        title: "Ticket no version",
        description: "desc",
        status: TicketStatus.TODO,
        priority: TicketPriority.LOW,
        currentVersionId: null,
        createdAt: now,
        updatedAt: now,
        currentVersion: null,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/projects/project-1/tickets"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    const body = await response.json();
    expect(body).toEqual([
      expect.objectContaining({
        id: "ticket-no-harness",
        harness: null,
      }),
      expect.objectContaining({
        id: "ticket-no-version",
        harness: null,
      }),
    ]);
    expect(Object.prototype.hasOwnProperty.call(body[0], "harness")).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(body[1], "harness")).toBe(true);
  });

  it("POST returns DTO-shaped ticket with top-level harness", async () => {
    const now = new Date("2026-05-01T01:00:00.000Z");
    mockTxTicketCreate.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      title: "Ticket 1",
      description: "desc",
      status: TicketStatus.BACKLOG,
      priority: TicketPriority.HIGH,
      createdAt: now,
      updatedAt: now,
    });
    mockTxTicketVersionCreate.mockResolvedValue({
      id: "version-1",
      version: 1,
      createdAt: now,
    });
    mockTxTicketUpdate.mockResolvedValue({
      id: "ticket-1",
      projectId: "project-1",
      title: "Ticket 1",
      description: "desc",
      status: TicketStatus.BACKLOG,
      priority: TicketPriority.HIGH,
      currentVersionId: "version-1",
      createdAt: now,
      updatedAt: now,
      currentVersion: {
        id: "version-1",
        ticketId: "ticket-1",
        version: 1,
        snapshot: {
          id: "ticket-1",
          title: "Ticket 1",
        },
        createdAt: now,
      },
    });

    const tx = {
      ticket: {
        create: mockTxTicketCreate,
        update: mockTxTicketUpdate,
      },
      ticketVersion: {
        create: mockTxTicketVersionCreate,
      },
    };
    mockTransaction.mockImplementation(async (fn: (trx: typeof tx) => unknown) => fn(tx));

    const response = await POST(
      new Request("http://localhost/api/projects/project-1/tickets", {
        method: "POST",
        body: JSON.stringify({
          title: "Ticket 1",
          description: "desc",
          priority: TicketPriority.HIGH,
        }),
      }),
      {
        params: Promise.resolve({ projectId: "project-1" }),
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ticket: expect.objectContaining({
          id: "ticket-1",
          currentVersionId: "version-1",
          currentVersionNumber: 1,
          harness: null,
        }),
      }),
    );
  });
});
