import { db } from "../db";
import { orchestratorInputSchema, type OrchestratorInput } from "./schemas";

export type GeneratePlanContext = {
  input: OrchestratorInput;
  existingTicketCount: number;
};

export async function buildGeneratePlanContext(projectId: string, userId: string) {
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: userId,
    },
    select: {
      id: true,
      name: true,
      description: true,
      _count: {
        select: {
          tickets: true,
        },
      },
    },
  });

  if (!project) {
    return null;
  }

  return {
    input: orchestratorInputSchema.parse({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
      currentTickets: [],
      recentEvents: [],
    }),
    existingTicketCount: project._count.tickets,
  } satisfies GeneratePlanContext;
}
