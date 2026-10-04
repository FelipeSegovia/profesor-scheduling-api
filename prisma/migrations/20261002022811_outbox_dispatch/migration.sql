-- DropIndex
DROP INDEX "OutboxEmail_status_idx";

-- AlterTable
ALTER TABLE "OutboxEmail" ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "providerId" TEXT;

-- CreateIndex
CREATE INDEX "OutboxEmail_status_nextAttemptAt_idx" ON "OutboxEmail"("status", "nextAttemptAt");
