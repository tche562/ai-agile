import { RunStatus, RunType } from "@prisma/client";
import { z } from "zod";

const idSchema = z.string().trim().min(1);

export const createRunSchema = z
  .object({
    type: z.nativeEnum(RunType),
    ticketId: idSchema.optional(),
    agentId: idSchema.optional(),
  })
  .strict();

export const patchRunSchema = z
  .object({
    status: z.nativeEnum(RunStatus),
  })
  .strict();
