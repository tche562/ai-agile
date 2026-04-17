import { db } from "../db";
import { requireAuthUser } from "../auth/require-auth-user";

export async function assertProjectOwnership(projectId: string) {
  const currentUser = await requireAuthUser();

  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: currentUser.id,
    },
  });

  if (!project) {
    return null;
  }

  return { currentUser, project };
}
