import { db } from "@/server/db";
import { requireAuthUser } from "@/server/auth/require-auth-user";

export async function getOwnedRunOrNull(runId: string) {
  const currentUser = await requireAuthUser();

  return db.run.findFirst({
    where: {
      id: runId,
      project: {
        ownerId: currentUser.id,
      },
    },
  });
}
