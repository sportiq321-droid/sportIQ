-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN "eligibility" JSONB;
ALTER TABLE "Tournament" ADD COLUMN "format" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "limits" JSONB;
ALTER TABLE "Tournament" ADD COLUMN "media" JSONB;
ALTER TABLE "Tournament" ADD COLUMN "organizerEmail" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "organizerMobile" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "organizerName" TEXT;
ALTER TABLE "Tournament" ADD COLUMN "registrationDocs" JSONB;
ALTER TABLE "Tournament" ADD COLUMN "registrationFee" INTEGER;
ALTER TABLE "Tournament" ADD COLUMN "registrationLastDate" DATETIME;

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
