import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { db } from "../db";

export async function requireAuthUser() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect("/login");
  }

  const email = session.user.email;
  return db.user.upsert({
    where: { email },
    create: {
      email,
      name: session.user.name ?? null,
    },
    update: {
      name: session.user.name ?? null,
    },
  });
}
