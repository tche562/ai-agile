import { notFound } from "next/navigation";

import { db } from "../db";
import { requireAuthUser } from "../auth/require-auth-user";

export async function getOwnedProjectOr404(projectId: string) {
  const currentUser = await requireAuthUser();

  const project = await db.project.findFirst({
    where: {
      id: projectId,
      ownerId: currentUser.id,
    },
  });

  if (!project) {
    notFound();
  }

  return project;
}
