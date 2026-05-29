import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Playwright global setup.");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });

const prisma = new PrismaClient({
  adapter,
});

export default async function globalSetup() {
  try {
    if (process.env.E2E_TEST_MODE !== "true") {
      return;
    }

    const userEmail = process.env.E2E_TEST_USER_EMAIL?.trim() || "e2e.user@ai-agile.local";

    await prisma.user.upsert({
      where: {
        email: userEmail,
      },
      update: {
        name: process.env.E2E_TEST_USER_NAME?.trim() || "E2E Test User",
      },
      create: {
        email: userEmail,
        name: process.env.E2E_TEST_USER_NAME?.trim() || "E2E Test User",
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
