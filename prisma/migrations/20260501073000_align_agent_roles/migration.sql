-- CreateEnum
CREATE TYPE "AgentRole_new" AS ENUM ('PLANNER', 'IMPLEMENTER', 'QA');

-- AlterTable
ALTER TABLE "Agent"
ALTER COLUMN "role" TYPE "AgentRole_new"
USING (
  CASE "role"::text
    WHEN 'PM' THEN 'PLANNER'
    WHEN 'TECH_LEAD' THEN 'PLANNER'
    WHEN 'ENGINEER' THEN 'IMPLEMENTER'
    WHEN 'QA' THEN 'QA'
    ELSE 'QA'
  END
)::"AgentRole_new";

-- DropEnum
DROP TYPE "AgentRole";

-- RenameEnum
ALTER TYPE "AgentRole_new" RENAME TO "AgentRole";
