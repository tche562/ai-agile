import { TicketPriority, TicketStatus } from "@prisma/client";
import { z } from "zod";

const titleSchema = z.string().trim().min(1);
const descriptionSchema = z.string().trim().min(1).nullable();

export const createTicketSchema = z.object({
  title: titleSchema,
  description: descriptionSchema.optional(),
  status: z.nativeEnum(TicketStatus).optional(),
  priority: z.nativeEnum(TicketPriority).optional(),
}).strict();

export const patchTicketSchema = z
  .object({
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    status: z.nativeEnum(TicketStatus).optional(),
    priority: z.nativeEnum(TicketPriority).optional(),
  })
  .strict()
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });
