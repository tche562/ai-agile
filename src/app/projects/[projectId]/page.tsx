import { getOwnedProjectOr404 } from "@/server/projects/get-owned-project-or-404";

type ProjectPageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const project = await getOwnedProjectOr404(projectId);

  return (
    <main>
      <h1>{project.name}</h1>
      <p>Project ID: {project.id}</p>
      <p>Owner ID: {project.ownerId}</p>
    </main>
  );
}
