import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { DatabaseService } from './database.service.js';

export async function cleanupExpiredSubmissions(
  database: DatabaseService,
  artifactDirectory: string,
): Promise<void> {
  const expiresAt = { lt: new Date() };
  const status = { not: 'FINALIZED' as const };
  const expired = await database.reportSubmission.findMany({
    where: { expiresAt, status },
    include: { artifact: true },
    take: 500,
  });
  await Promise.all(
    expired.map(async (submission) => {
      // The conditional delete arbitrates with finalization and other cleanup workers.
      // Never remove the file before the database confirms ownership of the deletion.
      const deleted = await database.reportSubmission.deleteMany({
        where: { id: submission.id, expiresAt, status },
      });
      if (deleted.count > 0 && submission.artifact) {
        await rm(join(artifactDirectory, `${submission.artifact.id}.png`), { force: true });
      }
    }),
  );
}
