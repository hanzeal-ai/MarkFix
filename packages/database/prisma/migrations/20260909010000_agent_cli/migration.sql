-- AlterEnum
ALTER TYPE "ReportStatus" ADD VALUE 'FIX_FAILED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "repositoryId" UUID,
ADD COLUMN     "repositoryName" TEXT;

-- CreateTable
CREATE TABLE "AgentDeviceRequest" (
    "id" UUID NOT NULL,
    "deviceCodeHash" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'codex',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "grantId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDeviceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGrant" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceName" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'codex',
    "projectIds" UUID[],
    "accessHash" TEXT,
    "refreshHash" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRepository" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "localId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "deviceName" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'codex',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRepository_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentFixAttempt" (
    "id" UUID NOT NULL,
    "reportId" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "reportVersion" INTEGER NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "reason" TEXT,
    "stage" TEXT,
    "evidence" JSONB,
    "resultHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentFixAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeviceRequest_deviceCodeHash_key" ON "AgentDeviceRequest"("deviceCodeHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeviceRequest_userCode_key" ON "AgentDeviceRequest"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDeviceRequest_grantId_key" ON "AgentDeviceRequest"("grantId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentGrant_accessHash_key" ON "AgentGrant"("accessHash");

-- CreateIndex
CREATE UNIQUE INDEX "AgentGrant_refreshHash_key" ON "AgentGrant"("refreshHash");

-- CreateIndex
CREATE INDEX "AgentGrant_userId_idx" ON "AgentGrant"("userId");

-- CreateIndex
CREATE INDEX "AgentRepository_userId_name_idx" ON "AgentRepository"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRepository_userId_localId_key" ON "AgentRepository"("userId", "localId");

-- CreateIndex
CREATE INDEX "AgentFixAttempt_reportId_createdAt_idx" ON "AgentFixAttempt"("reportId", "createdAt");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "AgentRepository"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDeviceRequest" ADD CONSTRAINT "AgentDeviceRequest_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AgentGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGrant" ADD CONSTRAINT "AgentGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRepository" ADD CONSTRAINT "AgentRepository_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFixAttempt" ADD CONSTRAINT "AgentFixAttempt_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFixAttempt" ADD CONSTRAINT "AgentFixAttempt_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "AgentGrant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

