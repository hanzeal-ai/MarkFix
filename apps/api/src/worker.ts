import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@markfix/database';

const database = new PrismaClient();
const artifactDirectory = resolve(process.env.ARTIFACT_DIR ?? './data/artifacts');

const runCleanup = async (): Promise<void> => {
  const expired = await database.reportSubmission.findMany({
    where: { expiresAt: { lt: new Date() }, status: { not: 'FINALIZED' } },
    include: { artifact: true },
  });
  for (const submission of expired) {
    if (submission.artifact) {
      await rm(join(artifactDirectory, `${submission.artifact.id}.png`), { force: true });
    }
    await database.reportSubmission.delete({ where: { id: submission.id } });
  }
  if (expired.length > 0)
    console.log(JSON.stringify({ event: 'expired_submissions_cleaned', count: expired.length }));
};

await runCleanup();
const timer = setInterval(() => void runCleanup(), 60 * 60 * 1000);
process.on('SIGTERM', () => {
  clearInterval(timer);
  void database.$disconnect().finally(() => process.exit(0));
});
