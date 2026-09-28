-- Existing unbound requests expire naturally and cannot be approved by the new API.
-- Grants already issued remain valid and keep their existing project scope.
ALTER TABLE "AgentDeviceRequest" ADD COLUMN "targetUserId" UUID;
ALTER TABLE "AgentDeviceRequest" ADD CONSTRAINT "AgentDeviceRequest_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AgentDeviceRequest_targetUserId_status_expiresAt_idx"
  ON "AgentDeviceRequest"("targetUserId", "status", "expiresAt");
