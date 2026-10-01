-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusChangedBy" "Actor";
