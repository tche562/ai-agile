import type { EventType, Prisma, PrismaClient } from "@prisma/client";

import { eventInsertSchema, validateEventPayload } from "./schemas";

type EventWriter = Prisma.TransactionClient | PrismaClient;

export type CreateEventInput<TType extends EventType = EventType> = {
  type: TType;
  payload: unknown;
  projectId: string;
  ticketId?: string | null;
};

export async function createValidatedEvent<TType extends EventType>(
  prisma: EventWriter,
  input: CreateEventInput<TType>,
) {
  const payload = validateEventPayload(input.type, input.payload);

  const parsed = eventInsertSchema.parse({
    type: input.type,
    payload,
  });

  return prisma.event.create({
    data: {
      type: parsed.type,
      payload: parsed.payload as Prisma.InputJsonValue,
      projectId: input.projectId,
      ticketId: input.ticketId ?? null,
    },
  });
}
