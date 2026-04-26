-- Add durable audit snapshot fields to Usage.
ALTER TABLE "Usage"
ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'unknown-user',
ADD COLUMN "projectId" TEXT NOT NULL DEFAULT 'unknown-project',
ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'unknown-provider',
ADD COLUMN "model" TEXT NOT NULL DEFAULT 'unknown-model';

-- Make runId optional for calls that may not have a run.
ALTER TABLE "Usage" DROP CONSTRAINT IF EXISTS "Usage_runId_fkey";
ALTER TABLE "Usage" ALTER COLUMN "runId" DROP NOT NULL;
ALTER TABLE "Usage"
ADD CONSTRAINT "Usage_runId_fkey"
FOREIGN KEY ("runId") REFERENCES "Run"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add indexes for daily quota and reporting lookups.
CREATE INDEX "Usage_userId_createdAt_idx" ON "Usage"("userId", "createdAt");
CREATE INDEX "Usage_projectId_createdAt_idx" ON "Usage"("projectId", "createdAt");
CREATE INDEX "Usage_provider_model_createdAt_idx" ON "Usage"("provider", "model", "createdAt");
