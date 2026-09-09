-- Coordinated release: stop writers and back up the database before applying.
-- No runtime workspace compatibility is retained.
BEGIN;
LOCK TABLE "Project", "Workspace", "Membership", "Invitation" IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM "Project" p JOIN "Workspace" w ON w.id = p."workspaceId"
    WHERE w."createdById" IS NULL OR NOT EXISTS (
      SELECT 1 FROM "Membership" m WHERE m."workspaceId"=w.id
      AND m."userId"=w."createdById" AND m.role='OWNER' AND m.status='ACTIVE'
    )
  ) THEN RAISE EXCEPTION 'Every project requires an active owner. Resolve ownership before migration.'; END IF;
  IF EXISTS (
    SELECT 1 FROM "Invitation" i WHERE (SELECT count(*) FROM "Project" p WHERE p."workspaceId"=i."workspaceId") <> 1
  ) THEN RAISE EXCEPTION 'Invitations require an unambiguous target project. Resolve existing invitations before migration.'; END IF;
END $$;
ALTER TYPE "WorkspaceRole" RENAME TO "ProjectRole";
ALTER TYPE "WorkspacePlan" RENAME TO "AccountPlan";
ALTER TABLE "User" ADD COLUMN "plan" "AccountPlan" NOT NULL DEFAULT 'FREE', ADD COLUMN "upgradeRequestedAt" TIMESTAMP(3);
UPDATE "User" u SET plan='TEAM' WHERE EXISTS (SELECT 1 FROM "Workspace" w WHERE w."createdById"=u.id AND w.plan='TEAM');
UPDATE "User" u SET "upgradeRequestedAt"=(SELECT max(w."upgradeRequestedAt") FROM "Workspace" w WHERE w."createdById"=u.id);
ALTER TABLE "Project" ADD COLUMN "ownerId" UUID;
UPDATE "Project" p SET "ownerId"=w."createdById" FROM "Workspace" w WHERE w.id=p."workspaceId";
ALTER TABLE "Project" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE TABLE "ProjectMembershipMigration" (
 "projectId" UUID NOT NULL REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 "userId" UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE ON UPDATE CASCADE,
 role "ProjectRole" NOT NULL, status "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("projectId", "userId")
);
INSERT INTO "ProjectMembershipMigration" SELECT p.id,m."userId",m.role,m.status,m."createdAt",m."updatedAt"
 FROM "Membership" m JOIN "Project" p ON p."workspaceId"=m."workspaceId";
DO $$ BEGIN
 IF (SELECT count(*) FROM "ProjectMembershipMigration") <> (SELECT count(*) FROM "Membership" m JOIN "Project" p ON p."workspaceId"=m."workspaceId")
 THEN RAISE EXCEPTION 'Project membership count invariant failed'; END IF;
END $$;
DROP TABLE "Membership";
ALTER TABLE "ProjectMembershipMigration" RENAME TO "Membership";
ALTER TABLE "Membership" RENAME CONSTRAINT "ProjectMembershipMigration_pkey" TO "Membership_pkey";
ALTER TABLE "Membership" RENAME CONSTRAINT "ProjectMembershipMigration_projectId_fkey" TO "Membership_projectId_fkey";
ALTER TABLE "Membership" RENAME CONSTRAINT "ProjectMembershipMigration_userId_fkey" TO "Membership_userId_fkey";
ALTER TABLE "Invitation" ADD COLUMN "projectId" UUID;
UPDATE "Invitation" i SET "projectId"=p.id FROM "Project" p WHERE p."workspaceId"=i."workspaceId";
ALTER TABLE "Invitation" ALTER COLUMN "projectId" SET NOT NULL;
ALTER TABLE "Invitation" DROP COLUMN "workspaceId";
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"(id) ON DELETE CASCADE ON UPDATE CASCADE;
UPDATE "ProjectDesktopState" SET payload=jsonb_set(payload,'{project}',(payload->'project')-'workspaceId') WHERE payload->'project' ? 'workspaceId';
ALTER TABLE "Project" DROP COLUMN "workspaceId";
DROP TABLE "Workspace";
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId","updatedAt");
COMMIT;
