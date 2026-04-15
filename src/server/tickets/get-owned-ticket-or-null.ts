import { db } from "@/server/db";
import { requireAuthUser } from "@/server/auth/require-auth-user";

export async function getOwnedTicketOrNull(ticketId: string) {
  const currentUser = await requireAuthUser();

  const ticket = await db.ticket.findFirst({
    where: {
      id: ticketId,
      project: {
        ownerId: currentUser.id,
      },
    },
    include: {
      project: true,
    },
  });

  return ticket;
}
