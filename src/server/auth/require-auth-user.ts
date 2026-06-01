import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/auth";
import { db } from "../db";
import { getE2ETestUserIdentity, isE2ETestModeEnabled } from "./e2e-test-mode";

export async function requireAuthUser() {
  if (isE2ETestModeEnabled()) {
    const testIdentity = getE2ETestUserIdentity();

    return db.user.upsert({
      where: { email: testIdentity.email },
      create: {
        email: testIdentity.email,
        name: testIdentity.name,
      },
      update: {
        name: testIdentity.name,
      },
    });
  }

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
