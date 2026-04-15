import { db } from "@/server/db";
import { requireAuthUser } from "@/server/auth/require-auth-user";

export async function getOwnedEventOrNull(eventId: string) {
  const currentUser = await requireAuthUser();

  const event = await db.event.findFirst({
    where: {
      id: eventId,
      project: {
        ownerId: currentUser.id,
      },
    },
  });

  return event;
}
