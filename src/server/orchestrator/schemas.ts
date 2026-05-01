import { z } from "zod";

export const ticketStatusSchema = z.enum([
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "IN_REVIEW",
  "BLOCKED",
  "DONE",
]);

export const ticketPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export const eventTypeSchema = z.enum([
  "TICKET_UPDATED",
  "WORKLOG_ADDED",
  "DECISION_MADE",
  "BLOCKER_FOUND",
  "SCOPE_CHANGED",
  "REPLAN_REQUESTED",
  "REPLAN_APPLIED",
]);

export const ticketHarnessSchema = z
  .object({
    goal: z.string().min(1),
    inputs: z.array(z.string()),
    output_format: z.array(z.string()),
    acceptance_checks: z.array(z.string()),
    non_goals: z.array(z.string()),
    risks: z.array(z.string()),
    test_ideas: z.array(z.string()),
  })
  .strict();

export const projectContextSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullable().optional(),
  })
  .strict();

export const currentTicketSummarySchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().nullable().optional(),
    status: ticketStatusSchema,
    priority: ticketPrioritySchema,
    harness: ticketHarnessSchema.nullable().optional(),
  })
  .strict();

export const recentEventSummarySchema = z
  .object({
    id: z.string().min(1),
    type: eventTypeSchema,
    ticketId: z.string().nullable().optional(),
    createdAt: z.string().min(1),
    summary: z.string().min(1),
    payload: z.unknown().optional(),
  })
  .strict();

export const orchestratorInputSchema = z
  .object({
    project: projectContextSchema,
    currentTickets: z.array(currentTicketSummarySchema),
    recentEvents: z.array(recentEventSummarySchema),
  })
  .strict();

export const createTicketProposalSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    priority: ticketPrioritySchema,
    harness: ticketHarnessSchema,
  })
  .strict();

export const updateTicketProposalSchema = z
  .object({
    ticketId: z.string().min(1),
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    priority: ticketPrioritySchema.optional(),
    harness: ticketHarnessSchema.optional(),
    reason: z.string().min(1),
  })
  .strict()
  .refine(
    (value) =>
      value.title !== undefined ||
      value.description !== undefined ||
      value.priority !== undefined ||
      value.harness !== undefined,
    {
      message: "At least one updatable ticket field must be provided.",
    },
  );

export const closeTicketProposalSchema = z
  .object({
    ticketId: z.string().min(1),
    reason: z.string().min(1),
  })
  .strict();

export const orchestratorOutputSchema = z
  .object({
    createTickets: z.array(createTicketProposalSchema),
    updateTickets: z.array(updateTicketProposalSchema),
    closeTickets: z.array(closeTicketProposalSchema),
    rationale: z.string().min(1),
  })
  .strict();

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type EventType = z.infer<typeof eventTypeSchema>;
export type TicketHarness = z.infer<typeof ticketHarnessSchema>;

export type ProjectContext = z.infer<typeof projectContextSchema>;
export type CurrentTicketSummary = z.infer<typeof currentTicketSummarySchema>;
export type RecentEventSummary = z.infer<typeof recentEventSummarySchema>;
export type OrchestratorInput = z.infer<typeof orchestratorInputSchema>;

export type CreateTicketProposal = z.infer<typeof createTicketProposalSchema>;
export type UpdateTicketProposal = z.infer<typeof updateTicketProposalSchema>;
export type CloseTicketProposal = z.infer<typeof closeTicketProposalSchema>;
export type OrchestratorOutput = z.infer<typeof orchestratorOutputSchema>;
