import { EventType } from "@prisma/client";
import { z } from "zod";

const ticketUpdatedPayloadSchema = z.object({
  fieldsChanged: z.array(z.string()).min(1),
  summary: z.string().min(1),
});

const worklogAddedPayloadSchema = z.object({
  agentRole: z.string().min(1),
  summary: z.string().min(1),
  artifacts: z.array(z.string()).optional(),
});

const decisionMadePayloadSchema = z.object({
  decision: z.string().min(1),
  reason: z.string().min(1),
});

const blockerFoundPayloadSchema = z.object({
  blocker: z.string().min(1),
  impact: z.string().min(1),
  suggestedNext: z.string().min(1).optional(),
});

const scopeChangedPayloadSchema = z.object({
  change: z.string().min(1),
  reason: z.string().min(1),
  impactTickets: z.array(z.string()).optional(),
});

const replanRequestedPayloadSchema = z.object({
  triggeredBy: z.enum(["user", "system"]),
  reason: z.string().min(1),
});

const replanAppliedPayloadSchema = z.object({
  rationale: z.string().min(1),
  updatedTicketIds: z.array(z.string()),
  createdTicketIds: z.array(z.string()),
  closedTicketIds: z.array(z.string()),
});

const payloadByTypeSchema = {
  [EventType.TICKET_UPDATED]: ticketUpdatedPayloadSchema,
  [EventType.WORKLOG_ADDED]: worklogAddedPayloadSchema,
  [EventType.DECISION_MADE]: decisionMadePayloadSchema,
  [EventType.BLOCKER_FOUND]: blockerFoundPayloadSchema,
  [EventType.SCOPE_CHANGED]: scopeChangedPayloadSchema,
  [EventType.REPLAN_REQUESTED]: replanRequestedPayloadSchema,
  [EventType.REPLAN_APPLIED]: replanAppliedPayloadSchema,
} as const;

const ticketUpdatedEventSchema = z.object({
  type: z.literal(EventType.TICKET_UPDATED),
  payload: ticketUpdatedPayloadSchema,
});

const worklogAddedEventSchema = z.object({
  type: z.literal(EventType.WORKLOG_ADDED),
  payload: worklogAddedPayloadSchema,
});

const decisionMadeEventSchema = z.object({
  type: z.literal(EventType.DECISION_MADE),
  payload: decisionMadePayloadSchema,
});

const blockerFoundEventSchema = z.object({
  type: z.literal(EventType.BLOCKER_FOUND),
  payload: blockerFoundPayloadSchema,
});

const scopeChangedEventSchema = z.object({
  type: z.literal(EventType.SCOPE_CHANGED),
  payload: scopeChangedPayloadSchema,
});

const replanRequestedEventSchema = z.object({
  type: z.literal(EventType.REPLAN_REQUESTED),
  payload: replanRequestedPayloadSchema,
});

const replanAppliedEventSchema = z.object({
  type: z.literal(EventType.REPLAN_APPLIED),
  payload: replanAppliedPayloadSchema,
});

export const eventInsertSchema = z.discriminatedUnion("type", [
  ticketUpdatedEventSchema,
  worklogAddedEventSchema,
  decisionMadeEventSchema,
  blockerFoundEventSchema,
  scopeChangedEventSchema,
  replanRequestedEventSchema,
  replanAppliedEventSchema,
]);

export type EventInsertInput = z.infer<typeof eventInsertSchema>;

export type EventPayloadByType = {
  [K in EventType]: z.infer<(typeof payloadByTypeSchema)[K]>;
};

export function validateEventPayload<TType extends EventType>(
  type: TType,
  payload: unknown,
): EventPayloadByType[TType] {
  const schema = payloadByTypeSchema[type];
  return schema.parse(payload) as EventPayloadByType[TType];
}
