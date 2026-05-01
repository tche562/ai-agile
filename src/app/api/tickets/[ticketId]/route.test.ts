import { TicketPriority, TicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetOwnedTicketOrNull,
  mockPatchTicketSchemaSafeParse,
  mockTransaction,
  mockTxTicketUpdate,
  mockTxTicketVersionFindFirst,
  mockTxTicketVersionCreate,
} = vi.hoisted(() => ({
  mockGetOwnedTicketOrNull: vi.fn(),
  mockPatchTicketSchemaSafeParse: vi.fn(),
  mockTransaction: vi.fn(),
  mockTxTicketUpdate: vi.fn(),
  mockTxTicketVersionFindFirst: vi.fn(),
  mockTxTicketVersionCreate: vi.fn(),
}));

vi.mock("@/server/tickets/get-owned-ticket-or-null", () => ({
  getOwnedTicketOrNull: mockGetOwnedTicketOrNull,
}));

vi.mock("@/server/tickets/ticket.schemas", () => ({
  patchTicketSchema: {
    safeParse: mockPatchTicketSchemaSafeParse,
  },
}));

vi.mock("@/server/db", () => ({
  db: {
    $transaction: mockTransaction,
  },
}));

import { PATCH } from "./route";

describe("PATCH /api/tickets/[ticketId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOwnedTicketOrNull.mockResolvedValue({
      id: "ticket-1",
    });
    mockPatchTicketSchemaSafeParse.mockImplementation((payload: unknown) => ({
      success: true,
      data: payload,
    }));
  });

  it("returns DTO-shaped ticket with top-level harness preserved from previous snapshot", async () => {
    const now = new Date("2026-05-01T01:00:00.000Z");
    const previousHarness = {
      goal: "Keep this harness",
      acceptance_checks: ["still valid"],
    };

    mockTxTicketUpdate
      .mockResolvedValueOnce({
        id: "ticket-1",
        projectId: "project-1",
        title: "Ticket title updated",
        description: "desc",
        status: TicketStatus.BACKLOG,
        priority: TicketPriority.HIGH,
        updatedAt: now,
      })
      .mockResolvedValueOnce({
        id: "ticket-1",
        projectId: "project-1",
        title: "Ticket title updated",
        description: "desc",
        status: TicketStatus.BACKLOG,
        priority: TicketPriority.HIGH,
        currentVersionId: "version-2",
        createdAt: now,
        updatedAt: now,
        currentVersion: {
          id: "version-2",
          ticketId: "ticket-1",
          version: 2,
          snapshot: {
            harness: previousHarness,
          },
          createdAt: now,
        },
      });

    mockTxTicketVersionFindFirst.mockResolvedValue({
      version: 1,
      snapshot: {
        harness: previousHarness,
      },
    });

    mockTxTicketVersionCreate.mockResolvedValue({
      id: "version-2",
      version: 2,
      createdAt: now,
    });

    const tx = {
      ticket: {
        update: mockTxTicketUpdate,
      },
      ticketVersion: {
        findFirst: mockTxTicketVersionFindFirst,
        create: mockTxTicketVersionCreate,
      },
    };
    mockTransaction.mockImplementation(async (fn: (trx: typeof tx) => unknown) => fn(tx));

    const response = await PATCH(
      new Request("http://localhost/api/tickets/ticket-1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Ticket title updated",
        }),
      }),
      {
        params: Promise.resolve({ ticketId: "ticket-1" }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ticket: expect.objectContaining({
          id: "ticket-1",
          currentVersionNumber: 2,
          harness: previousHarness,
        }),
      }),
    );

    expect(mockTxTicketVersionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          snapshot: expect.objectContaining({
            harness: previousHarness,
          }),
        }),
      }),
    );
  });
});
