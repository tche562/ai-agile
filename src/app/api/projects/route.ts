import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/server/db";
import { requireAuthUser } from "@/server/auth/require-auth-user";

const createProjectSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
});

export async function POST(request: Request) {
  const currentUser = await requireAuthUser();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project payload" }, { status: 400 });
  }

  const project = await db.project.create({
    data: {
      ownerId: currentUser.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
    },
  });

  return NextResponse.json(project, { status: 201 });
}

export async function GET() {
  const currentUser = await requireAuthUser();

  const projects = await db.project.findMany({
    where: {
      ownerId: currentUser.id,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return NextResponse.json(projects);
}
