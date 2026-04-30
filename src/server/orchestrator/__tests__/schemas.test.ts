import { describe, expect, it } from "vitest";

import { orchestratorInputSchema, orchestratorOutputSchema } from "../schemas";

const validHarness = {
  goal: "Build the project dashboard.",
  inputs: ["Project model", "Ticket model"],
  output_format: ["Dashboard page", "Ticket table"],
  acceptance_checks: ["User can view project tickets."],
  non_goals: ["Do not implement drag and drop."],
  risks: ["Large ticket lists may need pagination."],
  test_ideas: ["Render dashboard with seeded tickets."],
};

describe("orchestratorInputSchema", () => {
  it("accepts a valid orchestrator input", () => {
    const result = orchestratorInputSchema.safeParse({
      project: {
        id: "project_1",
        name: "AI Agile MVP",
        description: "AI-assisted agile project management system.",
      },
      currentTickets: [
        {
          id: "ticket_1",
          title: "Build project dashboard",
          description: "Create the project dashboard page.",
          status: "BACKLOG",
          priority: "HIGH",
          harness: validHarness,
        },
        {
          id: "ticket_2",
          title: "Implement auth",
          description: null,
          status: "IN_PROGRESS",
          priority: "CRITICAL",
          harness: null,
        },
      ],
      recentEvents: [
        {
          id: "event_1",
          type: "SCOPE_CHANGED",
          ticketId: "ticket_1",
          createdAt: "2026-04-28T00:00:00.000Z",
          summary: "Dashboard scope was updated.",
          payload: {
            note: "Add event timeline later.",
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid ticket status values", () => {
    const result = orchestratorInputSchema.safeParse({
      project: {
        id: "project_1",
        name: "AI Agile MVP",
        description: "AI-assisted agile project management system.",
      },
      currentTickets: [
        {
          id: "ticket_1",
          title: "Build project dashboard",
          description: "Create the project dashboard page.",
          status: "DOING",
          priority: "HIGH",
          harness: validHarness,
        },
      ],
      recentEvents: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid ticket priority values", () => {
    const result = orchestratorInputSchema.safeParse({
      project: {
        id: "project_1",
        name: "AI Agile MVP",
        description: "AI-assisted agile project management system.",
      },
      currentTickets: [
        {
          id: "ticket_1",
          title: "Build project dashboard",
          description: "Create the project dashboard page.",
          status: "BACKLOG",
          priority: "P0",
          harness: validHarness,
        },
      ],
      recentEvents: [],
    });

    expect(result.success).toBe(false);
  });
});

describe("orchestratorOutputSchema", () => {
  it("accepts a valid orchestrator output", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [
        {
          title: "Build project dashboard",
          description: "Create the MVP dashboard for project tickets.",
          priority: "HIGH",
          harness: validHarness,
        },
      ],
      updateTickets: [
        {
          ticketId: "ticket_1",
          description: "Updated description based on recent scope change.",
          reason: "Recent event changed the dashboard requirements.",
        },
      ],
      closeTickets: [
        {
          ticketId: "ticket_2",
          reason: "Merged into the dashboard ticket.",
        },
      ],
      rationale: "The plan was updated based on recent project events.",
    });

    expect(result.success).toBe(true);
  });

  it("rejects unknown top-level fields", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [],
      updateTickets: [],
      closeTickets: [],
      rationale: "Valid rationale.",
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it("rejects create ticket proposals without harness", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [
        {
          title: "Build project dashboard",
          description: "Create the dashboard.",
          priority: "HIGH",
        },
      ],
      updateTickets: [],
      closeTickets: [],
      rationale: "Initial plan.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects update proposals without any updatable fields", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket_1",
          reason: "No actual update was provided.",
        },
      ],
      closeTickets: [],
      rationale: "Invalid update.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects attempts to directly set ticket status", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [],
      updateTickets: [
        {
          ticketId: "ticket_1",
          status: "DONE",
          reason: "The model tried to directly set status.",
        },
      ],
      closeTickets: [],
      rationale: "Invalid status update.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects create ticket proposals that directly set status", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [
        {
          title: "Build project dashboard",
          description: "Create the dashboard.",
          priority: "HIGH",
          status: "BACKLOG",
          harness: validHarness,
        },
      ],
      updateTickets: [],
      closeTickets: [],
      rationale: "Invalid create proposal.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid priority values in create proposals", () => {
    const result = orchestratorOutputSchema.safeParse({
      createTickets: [
        {
          title: "Build project dashboard",
          description: "Create the dashboard.",
          priority: "P0",
          harness: validHarness,
        },
      ],
      updateTickets: [],
      closeTickets: [],
      rationale: "Invalid priority.",
    });

    expect(result.success).toBe(false);
  });
});
