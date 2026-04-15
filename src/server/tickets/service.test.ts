import { EventType, TicketPriority, TicketStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateValidatedEvent, mockTransaction } = vi.hoisted(() => ({
  mockCreateValidatedEvent: vi.fn(),
  mockTransaction: vi.fn(),
}));

vi.mock("../db", () => ({
  db: {
    $transaction: mockTransaction,
  },
}));

vi.mock("../events/service", () => ({
  createValidatedEvent: mockCreateValidatedEvent,
}));

import { updateTicket } from "./service";

describe("updateTicket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a new ticket version and updates currentVersionId", async () => {
    const mockTx = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue({ id: "ticket-1" }),
        update: vi
          .fn()
          .mockResolvedValueOnce({
            id: "ticket-1",
            projectId: "project-1",
            title: "New title",
            description: "Updated description",
            status: TicketStatus.IN_PROGRESS,
            priority: TicketPriority.HIGH,
            updatedAt: new Date("2026-03-01T00:00:00.000Z"),
          })
          .mockResolvedValueOnce({
            id: "ticket-1",
            projectId: "project-1",
            currentVersionId: "version-2",
          }),
      },
      ticketVersion: {
        findFirst: vi.fn().mockResolvedValue({ version: 1 }),
        create: vi.fn().mockResolvedValue({
          id: "version-2",
          version: 2,
        }),
      },
    };

    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
    mockCreateValidatedEvent.mockResolvedValue({ id: "event-1" });

    const result = await updateTicket({
      ticketId: "ticket-1",
      data: {
        status: TicketStatus.IN_PROGRESS,
        priority: TicketPriority.HIGH,
      },
      summary: "Moved to in progress after kickoff.",
    });

    expect(mockTx.ticketVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ticketId: "ticket-1",
          version: 2,
        }),
      }),
    );

    expect(mockTx.ticket.update).toHaveBeenLastCalledWith({
      where: { id: "ticket-1" },
      data: { currentVersionId: "version-2" },
      select: {
        id: true,
        projectId: true,
        currentVersionId: true,
      },
    });

    expect(mockCreateValidatedEvent).toHaveBeenCalledWith(
      mockTx,
      expect.objectContaining({
        type: EventType.TICKET_UPDATED,
        projectId: "project-1",
        ticketId: "ticket-1",
      }),
    );

    expect(result.ticket.currentVersionId).toBe("version-2");
    expect(result.version.version).toBe(2);
  });

  it("surfaces unique-version conflicts under concurrent updates", async () => {
    const versionRegistry = new Set<string>();

    const mockTx = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue({ id: "ticket-1" }),
        update: vi
          .fn()
          .mockImplementation(async ({ data }: { data: { currentVersionId?: string } }) => {
            if (data.currentVersionId) {
              return {
                id: "ticket-1",
                projectId: "project-1",
                currentVersionId: data.currentVersionId,
              };
            }

            return {
              id: "ticket-1",
              projectId: "project-1",
              title: "Concurrent title",
              description: "Concurrent update",
              status: TicketStatus.IN_PROGRESS,
              priority: TicketPriority.HIGH,
              updatedAt: new Date("2026-03-01T00:00:00.000Z"),
            };
          }),
      },
      ticketVersion: {
        // Simulate two transactions racing on the same observed latest version.
        findFirst: vi.fn().mockResolvedValue({ version: 1 }),
        create: vi
          .fn()
          .mockImplementation(async ({ data }: { data: { ticketId: string; version: number } }) => {
            const key = `${data.ticketId}:${data.version}`;

            if (versionRegistry.has(key)) {
              const uniqueError = Object.assign(new Error("Unique constraint failed"), {
                code: "P2002",
                meta: { target: ["ticketId", "version"] },
              });
              throw uniqueError;
            }

            versionRegistry.add(key);
            return {
              id: `version-${data.version}`,
              version: data.version,
            };
          }),
      },
    };

    mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => unknown) => fn(mockTx));
    mockCreateValidatedEvent.mockResolvedValue({ id: "event-1" });

    const inputs = [
      updateTicket({
        ticketId: "ticket-1",
        data: { status: TicketStatus.IN_PROGRESS },
        summary: "Concurrent update A",
      }),
      updateTicket({
        ticketId: "ticket-1",
        data: { priority: TicketPriority.HIGH },
        summary: "Concurrent update B",
      }),
    ];

    const settled = await Promise.allSettled(inputs);
    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const reason = (rejected[0] as PromiseRejectedResult).reason as { code?: string };
    expect(reason.code).toBe("P2002");
  });
});
