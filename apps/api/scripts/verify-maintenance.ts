// Run only against a disposable, migrated localhost database named audit.
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, access, rm, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@markfix/database';
import type { DatabaseService } from '../src/database.service.js';
import { cleanupExpiredSubmissions } from '../src/expired-submission-cleanup.js';
import { repairOrphanArtifacts } from '../src/orphan-artifact-repair.js';
import { createCommercialReport } from '../src/commercial/report-writer.js';

const url = process.env.TEST_DATABASE_URL;
assert(url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/audit');
const db = new PrismaClient({ datasourceUrl: url });
assert.equal(await db.project.count(), 0, 'Use an empty disposable audit database.');
const database = db as DatabaseService;
const dir = await mkdtemp(join(tmpdir(), 'markfix-maintenance-'));
const owner = await db.user.create({ data: { email: 'audit@example.test', displayName: 'audit' } });
const project = await db.project.create({ data: { ownerId: owner.id, name: 'fixture' } });
async function candidate() {
  const row = await db.reportSubmission.create({
    data: {
      projectId: project.id,
      idempotencyKey: crypto.randomUUID(),
      requestHash: 'test',
      payload: {},
      expiresAt: new Date(Date.now() - 1000),
      artifact: {
        create: {
          mimeType: 'image/png',
          size: 1,
          sha256: 'test',
          objectKey: crypto.randomUUID(),
        },
      },
    },
    include: { artifact: true },
  });
  assert(row.artifact);
  await writeFile(join(dir, `${row.artifact.id}.png`), 'x');
  return { ...row, artifact: row.artifact };
}
try {
  const stale = await candidate();
  const adapter = {
    reportSubmission: {
      findMany: async (args: Parameters<typeof db.reportSubmission.findMany>[0]) => {
        const rows = await db.reportSubmission.findMany(args);
        await db.$transaction(async (tx) => {
          await tx.report.create({
            data: {
              projectId: project.id,
              submissionId: stale.id,
              title: 'finalized',
              description: '',
              captureBundle: {},
              screenshotPath: stale.artifact.id,
            },
          });
          await tx.reportSubmission.update({
            where: { id: stale.id },
            data: { status: 'FINALIZED' },
          });
        });
        return rows;
      },
      deleteMany: db.reportSubmission.deleteMany.bind(db.reportSubmission),
    },
  };
  await cleanupExpiredSubmissions(adapter as unknown as DatabaseService, dir);
  await access(join(dir, `${stale.artifact.id}.png`));
  const expired = await candidate();
  let arrivals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const worker = {
    reportSubmission: {
      findMany: async (args: Parameters<typeof db.reportSubmission.findMany>[0]) => {
        const rows = await db.reportSubmission.findMany(args);
        if (++arrivals === 2) release();
        await gate;
        return rows;
      },
      deleteMany: db.reportSubmission.deleteMany.bind(db.reportSubmission),
    },
  };
  await Promise.all(
    [1, 2].map(() => cleanupExpiredSubmissions(worker as unknown as DatabaseService, dir)),
  );
  await assert.rejects(access(join(dir, `${expired.artifact.id}.png`)), { code: 'ENOENT' });
  console.log('PASS stale-finalization and two cleanup workers');

  const failedRemoval = await candidate();
  await chmod(dir, 0o555);
  try {
    await assert.rejects(cleanupExpiredSubmissions(database, dir));
  } finally {
    await chmod(dir, 0o755);
  }
  assert.equal(await db.reportSubmission.findUnique({ where: { id: failedRemoval.id } }), null);
  // Reproduce an upload which writes only after cleanup deleted its database row.
  await writeFile(join(dir, `${expired.artifact.id}.png`), 'late upload');
  const danglingId = crypto.randomUUID();
  await writeFile(join(dir, `${danglingId}.png`), 'report-only reference');
  await db.report.update({
    where: { submissionId: stale.id },
    data: { screenshotPath: danglingId },
  });
  const dry = await repairOrphanArtifacts(db, dir);
  assert.deepEqual(
    new Set(dry.candidates),
    new Set([`${failedRemoval.artifact.id}.png`, `${expired.artifact.id}.png`]),
  );
  assert.equal(dry.removed.length, 0);
  const repaired = await repairOrphanArtifacts(db, dir, true);
  assert.equal(repaired.failed.length, 0);
  assert.equal(repaired.removed.length, 2);
  await access(join(dir, `${stale.artifact.id}.png`));
  await access(join(dir, `${danglingId}.png`));
  assert.equal((await repairOrphanArtifacts(db, dir, true)).removed.length, 0);
  console.log(
    'PASS failed-rm/late-upload orphan repair, both reference types preserved, idempotent retry',
  );

  const input = {
    id: crypto.randomUUID(),
    projectId: project.id,
    authorId: null,
    title: 'legacy',
    note: 'preserve me',
    kind: 'ELEMENT' as const,
    pageUrl: 'https://example.test',
  };
  await db.managedAnnotation.create({ data: input });
  const migrated = await Promise.all(
    [1, 2].map(() => createCommercialReport(database, input, input.id)),
  );
  assert(migrated[0] && migrated[1]);
  assert.equal(migrated[0].id, migrated[1].id);
  assert.equal(await db.report.count({ where: { id: input.id } }), 1);
  const retry = { ...input, id: crypto.randomUUID() };
  await db.managedAnnotation.create({ data: retry });
  await assert.rejects(
    createCommercialReport(database, { ...retry, authorId: crypto.randomUUID() }, retry.id),
  );
  assert(await db.managedAnnotation.findUnique({ where: { id: retry.id } }));
  await createCommercialReport(database, retry, retry.id);
  await assert.rejects(
    createCommercialReport(database, { ...input, projectId: crypto.randomUUID() }, input.id),
    /invariant/,
  );
  await assert.rejects(
    createCommercialReport(database, { ...input, id: crypto.randomUUID() }, crypto.randomUUID()),
    /invariant/,
  );
  console.log('PASS concurrent legacy claim, failed creation rollback/retry, provenance guards');
} finally {
  await chmod(dir, 0o755);
  await db.report.deleteMany({ where: { projectId: project.id } });
  await db.project.delete({ where: { id: project.id } });
  await db.user.delete({ where: { id: owner.id } });
  await db.$disconnect();
  await rm(dir, { recursive: true, force: true });
}
