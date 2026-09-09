import { resolve } from 'node:path';
import { PrismaClient } from '@markfix/database';
import { repairOrphanArtifacts } from '../src/orphan-artifact-repair.js';

const args = process.argv.slice(2);
if (args.some((arg) => !['--apply', '--writers-stopped'].includes(arg)))
  throw new Error('Usage: repair-orphan-artifacts.ts [--apply --writers-stopped]');
const apply = args.includes('--apply');
if (apply && !args.includes('--writers-stopped'))
  throw new Error('Stop and drain every API instance and artifact writer before --apply.');
if (!process.env.DATABASE_URL || !process.env.ARTIFACT_DIR)
  throw new Error('Explicit DATABASE_URL and ARTIFACT_DIR are required.');
const database = new PrismaClient();
try {
  const result = await repairOrphanArtifacts(database, resolve(process.env.ARTIFACT_DIR), apply);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed.length) process.exitCode = 1;
} finally {
  await database.$disconnect();
}
