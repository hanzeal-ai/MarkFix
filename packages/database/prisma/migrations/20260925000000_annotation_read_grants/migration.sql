CREATE TABLE "AnnotationReadGrant" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AnnotationReadGrant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnnotationReadGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnotationReadGrant_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnnotationReadGrant_userId_projectId_key" ON "AnnotationReadGrant"("userId", "projectId");
