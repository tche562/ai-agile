import { db } from "@/server/db";
import { requireAuthUser } from "@/server/auth/require-auth-user";
import { SignOutButton } from "@/components/auth/sign-out-button";

export default async function ProjectsPage() {
  const currentUser = await requireAuthUser();

  const projects = await db.project.findMany({
    where: {
      ownerId: currentUser.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return (
    <main>
      <p>Logged in as {currentUser.email}</p>
      <SignOutButton />

      <h1>Your Projects</h1>

      {projects.length === 0 ? (
        <p>No projects yet.</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              {project.name} ({project.id})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
