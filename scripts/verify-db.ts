import "dotenv/config";
import { db } from "../src/server/db";

async function main() {
  const [users, projects, tickets, ticketVersions, events] = await Promise.all([
    db.user.count(),
    db.project.count(),
    db.ticket.count(),
    db.ticketVersion.count(),
    db.event.count(),
  ]);

  const ticketsMissingCurrentVersionId = await db.ticket.count({
    where: { currentVersionId: null },
  });

  console.log({
    users,
    projects,
    tickets,
    ticketVersions,
    events,
    ticketsMissingCurrentVersionId,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
