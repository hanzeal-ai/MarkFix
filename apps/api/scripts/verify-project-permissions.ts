// Only a disposable local database is allowed; never seed an existing application database.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PrismaClient } from '@markfix/database';
import type { DatabaseService } from '../src/database.service.js';
import { AppService } from '../src/app.service.js';
import { CommercialService } from '../src/commercial.service.js';
import { ProjectDataService } from '../src/project-data.service.js';
const url = process.env.TEST_DATABASE_URL;
assert(
  url && new URL(url).hostname === '127.0.0.1' && new URL(url).pathname === '/markfix_agent_audit',
);
const db = new PrismaClient({ datasourceUrl: url });
const database = db as DatabaseService;
try {
  const owner = await db.user.create({
    data: { email: `${crypto.randomUUID()}@test.local`, displayName: 'Permission test' },
  });
  const member = await db.user.create({
    data: { email: `${crypto.randomUUID()}@test.local`, displayName: 'Member' },
  });
  const app = new AppService(database);
  const commercial = new CommercialService(database);
  const data = new ProjectDataService(database);
  const projectA = await app.createProject(owner.id, { name: 'Allowed' });
  const projectB = await app.createProject(owner.id, { name: 'Private' });
  await db.membership.create({
    data: { projectId: projectA.id, userId: member.id, role: 'MEMBER' },
  });
  assert.deepEqual(
    (await app.listProjects(member.id)).map((p) => p.id),
    [projectA.id],
  );
  assert.deepEqual(
    (await commercial.overview(member.id)).projects.map((p) => p.id),
    [projectA.id],
  );
  await assert.rejects(app.getProject(member.id, projectB.id), /access/);
  await assert.rejects(app.listMembers(member.id, projectB.id), /access/);
  await assert.rejects(commercial.annotations(member.id, projectB.id), /access/);
  await assert.rejects(data.getState(member.id, projectB.id), /access/);
  await assert.rejects(app.updateProject(member.id, projectA.id, { name: 'No' }), /access/);
  await db.membership.update({
    where: { projectId_userId: { projectId: projectA.id, userId: member.id } },
    data: { status: 'SUSPENDED' },
  });
  await assert.rejects(app.getProject(member.id, projectA.id), /access/);
  assert.equal((await app.listProjects(member.id)).length, 0);
  for (const user of [owner, member]) {
    const token = crypto.randomUUID();
    await db.invitation.create({
      data: {
        projectId: projectA.id,
        email: user.email,
        role: 'REPORTER',
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const outcomes = await Promise.allSettled([
      app.acceptInvitation(user.id, token),
      app.acceptInvitation(user.id, token),
    ]);
    assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
    const membership = await db.membership.findUniqueOrThrow({
      where: { projectId_userId: { projectId: projectA.id, userId: user.id } },
    });
    assert.equal(membership.role, user.id === owner.id ? 'OWNER' : 'MEMBER');
    assert.equal(membership.status, user.id === owner.id ? 'ACTIVE' : 'SUSPENDED');
  }
  console.log(
    'PASS real PostgreSQL project isolation, role denial, membership suspension and overview visibility',
  );
} finally {
  await db.$disconnect();
}
