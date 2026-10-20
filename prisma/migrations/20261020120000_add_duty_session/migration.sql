-- CreateTable
CREATE TABLE "DutySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DutySession_organizationId_idx" ON "DutySession"("organizationId");

-- CreateIndex
CREATE INDEX "DutySession_userId_idx" ON "DutySession"("userId");

-- CreateIndex
CREATE INDEX "DutySession_userId_startedAt_idx" ON "DutySession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "DutySession_startedAt_idx" ON "DutySession"("startedAt");

-- CreateIndex
CREATE INDEX "DutySession_isActive_idx" ON "DutySession"("isActive");

-- AddForeignKey
ALTER TABLE "DutySession" ADD CONSTRAINT "DutySession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DutySession" ADD CONSTRAINT "DutySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
