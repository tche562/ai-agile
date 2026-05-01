import type { Prisma } from "@prisma/client";
import { TicketPriority, TicketStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { toTicketExecutionDTO, type TicketWithCurrentVersion } from "./execution-context";

function makeTicket(input: {
  snapshot?: unknown;
  currentVersionNumber?: number;
  currentVersionId?: string | null;
}): TicketWithCurrentVersion {
  const now = new Date("2026-05-01T00:00:00.000Z");

  return {
    id: "ticket-1",
    projectId: "project-1",
    title: "Ticket title",
    description: "Ticket description",
    status: TicketStatus.BACKLOG,
    priority: TicketPriority.HIGH,
    currentVersionId: input.currentVersionId ?? "version-1",
    createdAt: now,
    updatedAt: now,
    currentVersion:
      input.currentVersionId === null
        ? null
        : {
            id: "version-1",
            ticketId: "ticket-1",
            version: input.currentVersionNumber ?? 1,
            snapshot: (input.snapshot ?? {}) as Prisma.JsonValue,
            createdAt: now,
          },
  } as TicketWithCurrentVersion;
}

describe("toTicketExecutionDTO", () => {
  it("returns snapshot.harness when it exists", () => {
    const harness = {
      goal: "Ship feature",
      acceptance_checks: ["Works in prod"],
    };
    const ticket = makeTicket({
      snapshot: { harness },
      currentVersionNumber: 3,
    });

    const dto = toTicketExecutionDTO(ticket);

    expect(dto.harness).toEqual(harness);
    expect(dto.currentVersionNumber).toBe(3);
  });

  it("returns harness null and version null when currentVersion is null", () => {
    const ticket = makeTicket({
      currentVersionId: null,
    });

    const dto = toTicketExecutionDTO(ticket);

    expect(dto.harness).toBeNull();
    expect(dto.currentVersionNumber).toBeNull();
  });

  it("returns harness null when snapshot is not an object", () => {
    const ticket = makeTicket({
      snapshot: "bad snapshot",
    });

    const dto = toTicketExecutionDTO(ticket);
    expect(dto.harness).toBeNull();
  });

  it("returns harness null when snapshot has no harness field", () => {
    const ticket = makeTicket({
      snapshot: { other: "value" },
    });

    const dto = toTicketExecutionDTO(ticket);
    expect(dto.harness).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(dto, "harness")).toBe(true);
  });

  it("does not mutate the input ticket snapshot", () => {
    const snapshot = {
      harness: {
        goal: "No mutation",
      },
    };
    const ticket = makeTicket({ snapshot });
    const before = structuredClone(ticket.currentVersion?.snapshot);

    toTicketExecutionDTO(ticket);

    expect(ticket.currentVersion?.snapshot).toEqual(before);
  });
});
