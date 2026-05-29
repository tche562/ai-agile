import Link from "next/link";

import { CreateProjectForm } from "@/components/projects/create-project-form";
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
    <main className="min-h-screen bg-zinc-50 px-6 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col gap-6 rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-zinc-500">Logged in as {currentUser.email}</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-950">
              Your Projects
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Create a workspace, open its dashboard, then let the orchestrator generate and replan
              tickets.
            </p>
          </div>
          <SignOutButton />
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-medium uppercase tracking-wide text-zinc-500">
                  Workspaces
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-zinc-950">Project list</h2>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-600">
                {projects.length} total
              </span>
            </div>

            {projects.length === 0 ? (
              <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 p-8 text-center">
                <h3 className="text-lg font-semibold text-zinc-950">No projects yet</h3>
                <p className="mt-2 text-sm text-zinc-600">
                  Use the form on the right to create your first project.
                </p>
              </div>
            ) : (
              <div className="mt-6 space-y-3">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/projects/${project.id}`}
                    className="block rounded-2xl border border-zinc-200 p-5 transition hover:border-zinc-400 hover:bg-zinc-50"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="font-semibold text-zinc-950">{project.name}</h3>
                        <p className="mt-1 line-clamp-2 text-sm text-zinc-600">
                          {project.description ?? "No description"}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-zinc-500">Open dashboard</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <CreateProjectForm />
        </div>
      </div>
    </main>
  );
}
